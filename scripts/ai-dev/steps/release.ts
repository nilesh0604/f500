import { PipelineContext } from '../types.js';
import { Logger } from '../core/logger.js';
import { Shell } from '../core/shell.js';
import { AwsClient } from '../clients/aws.js';
import { GithubClient } from '../clients/github.js';
import { JiraClient } from '../clients/jira-client.js';
import { readPrNumber, markerFile, featureDir } from '../core/file-helpers.js';
import { join } from 'path';

const CF_DIST_ID = 'E1W56P4E23UU5Y';
const STACK_NAMES = [
  'OrderFlow-VyasaVector',
  'OrderFlow-VyasaRag',
  'OrderFlow-VyasaUi',
];
const REGIONS = ['us-east-1', 'us-east-2'];

export async function releaseCommand(ctx: PipelineContext): Promise<void> {
  const { ticketId, repoRoot, jira } = ctx;

  Logger.banner(`Release (Post-Merge Deploy): ${ticketId}`);
  console.log('');

  // Check prerequisite - verify deploy-ship is done
  const shipKeyResult = Shell.execSilent(
    `cat ${featureDir(repoRoot, ticketId)}/subtasks.json 2>/dev/null | grep '"deploy-ship"' | sed 's/.*"deploy-ship" *: *"\([^"]*\)".*/\x01/'`
  );
  const shipKey = shipKeyResult.stdout.trim();
  if (!shipKey) {
    throw new Error('No deploy-ship subtask found. Run deploy-ship first.');
  }

  const jiraCheck = new JiraClient(jira);
  const shipStatus = await jiraCheck.getStatus(shipKey);
  if (shipStatus !== 'Done') {
    throw new Error(
      `Deploy-ship not complete (status: ${shipStatus}). Run deploy-ship until CI is green, then merge the PR, then run release.`
    );
  }

  const prNumber = await readPrNumber(repoRoot, ticketId);
  if (!prNumber) {
    throw new Error('No PR number found. Run deploy-pr first.');
  }

  const gh = new GithubClient();
  const prInfo = gh.prInfo(prNumber);
  if (prInfo.state === 'open' || prInfo.state === 'closed') {
    throw new Error(
      `PR #${prNumber} is not merged yet (state: ${prInfo.state}).\n` +
        `  Merge the PR in GitHub, then re-run release.\n` +
        `  Merge: gh pr merge ${prNumber} --squash --delete-branch`
    );
  }

  console.log('[1/8] Switching to main and pulling latest...');
  Shell.exec('git checkout main', { cwd: repoRoot });
  Shell.exec('git pull origin main', { cwd: repoRoot });

  console.log('[2/8] Validating AWS credentials...');
  const aws = new AwsClient();
  let awsAccount: string;
  let awsRegion: string;
  try {
    const identity = aws.stsGetCallerIdentity();
    awsAccount = identity.account;
    awsRegion = process.env.AWS_REGION || 'us-east-1';
    console.log(`  Account: ${awsAccount}  Region: ${awsRegion}`);
  } catch {
    throw new Error(
      'AWS credentials not configured or expired.\n' +
        '  Run: aws configure  OR  export AWS_PROFILE=<profile>'
    );
  }

  console.log('[2b/8] Checking CloudFormation stack health...');
  let badStacks = '';
  for (const stackName of STACK_NAMES) {
    for (const region of REGIONS) {
      try {
        const stack = new AwsClient(region).cfnDescribeStack(stackName);
        if (
          stack &&
          (stack.stackStatus.includes('FAILED') ||
            stack.stackStatus === 'ROLLBACK_COMPLETE')
        ) {
          badStacks += `\n  ${stackName} (${region}): ${stack.stackStatus}`;
        }
      } catch {
        // Stack doesn't exist in this region
      }
    }
  }
  if (badStacks) {
    throw new Error(
      `Stuck CloudFormation stacks detected — delete them before releasing:${badStacks}\n` +
        '  Run: aws cloudformation delete-stack --stack-name <name> --region <region>'
    );
  }
  console.log('  All stacks healthy.');

  console.log('[3/8] Running cdk synth (pre-flight check)...');
  const infraDir = join(repoRoot, 'infra');
  const synthResult = Shell.exec('npx cdk synth --quiet', { cwd: infraDir });
  if (synthResult.exitCode !== 0) {
    const jiraClient = new JiraClient(jira);
    await jiraClient.addComment(
      ticketId,
      '❌ Release pre-flight failed: cdk synth error. Fix and re-run release.'
    );
    throw new Error(
      'cdk synth failed — fix stack configuration before deploying.'
    );
  }

  console.log('[4/8] Installing dependencies and building...');
  const npmCiResult = Shell.exec('npm ci', { cwd: repoRoot });
  if (npmCiResult.exitCode !== 0) {
    throw new Error('npm ci failed');
  }

  const ragBuildResult = Shell.exec('npx nx build vyasa-rag-service', {
    cwd: repoRoot,
  });
  if (ragBuildResult.exitCode !== 0) {
    const jiraClient = new JiraClient(jira);
    await jiraClient.addComment(
      ticketId,
      '❌ Release failed: vyasa-rag-service build error.'
    );
    throw new Error(
      'vyasa-rag-service build failed — cannot deploy stale artifact.'
    );
  }

  const uiBuildResult = Shell.exec('npm run build', {
    cwd: join(repoRoot, 'apps/vyasa-ui'),
  });
  if (uiBuildResult.exitCode !== 0) {
    const jiraClient = new JiraClient(jira);
    await jiraClient.addComment(
      ticketId,
      '❌ Release failed: vyasa-ui build error.'
    );
    throw new Error('vyasa-ui build failed — cannot deploy stale artifact.');
  }

  const releaseMarkerPath = markerFile(
    repoRoot,
    ticketId,
    'last-known-good-commit'
  );
  const headResult = Shell.execSilent('git rev-parse HEAD~1', repoRoot);
  const { writeFile } = await import('fs/promises');
  await writeFile(releaseMarkerPath, headResult.stdout.trim());

  const deployStart = Date.now();

  console.log('[5/8] Deploying changed services...');
  const changedFilesResult = Shell.execSilent(
    `gh pr view ${prNumber} --json files --jq '.files[].path' 2>/dev/null || git diff --name-only HEAD~1 HEAD`
  );
  const changedFiles = changedFilesResult.stdout;

  const uiChanged = /^apps\/vyasa-ui\//.test(changedFiles);
  const ragChanged = /^apps\/vyasa-rag-service\//.test(changedFiles);
  const infraChanged = /^infra\//.test(changedFiles);

  console.log(
    `  ui_changed=${uiChanged}  rag_changed=${ragChanged}  infra_changed=${infraChanged}`
  );

  let uiSynced = false;
  let deployedStacks = '';

  if (uiChanged) {
    console.log(`  Syncing UI to CloudFront distribution ${CF_DIST_ID}...`);
    const cfResult = Shell.execSilent(
      `aws cloudfront get-distribution --id ${CF_DIST_ID} --query "Distribution.DistributionConfig.Origins.Items[0].DomainName" --output text`
    );
    const originDomain = cfResult.stdout.trim();
    const uiS3Bucket = originDomain.replace(/\.s3\.[^.]*\.amazonaws\.com$/, '');

    if (!uiS3Bucket || uiS3Bucket === 'None') {
      throw new Error(
        `Could not resolve UI S3 bucket from CloudFront distribution ${CF_DIST_ID}`
      );
    }

    console.log(`  Syncing UI to s3://${uiS3Bucket} (us-east-1)...`);
    const s3SyncResult = Shell.exec(
      `aws s3 sync apps/vyasa-ui/dist/ s3://${uiS3Bucket}/ --delete --cache-control "public,max-age=31536000,immutable" --exclude "index.html" --region us-east-1`,
      { cwd: repoRoot }
    );
    if (s3SyncResult.exitCode !== 0) {
      const jiraClient = new JiraClient(jira);
      await jiraClient.addComment(
        ticketId,
        '❌ Release failed: S3 sync error.'
      );
      throw new Error('S3 sync failed.');
    }

    Shell.exec(
      `aws s3 cp apps/vyasa-ui/dist/index.html s3://${uiS3Bucket}/index.html --cache-control "no-cache,no-store,must-revalidate" --region us-east-1`,
      { cwd: repoRoot }
    );

    console.log(`  Invalidating CloudFront distribution ${CF_DIST_ID}...`);
    Shell.exec(
      `aws cloudfront create-invalidation --distribution-id ${CF_DIST_ID} --paths "/*"`
    );
    uiSynced = true;
  }

  if (ragChanged && !infraChanged) {
    console.log('  Deploying CDK stack: OrderFlow-VyasaRag');
    const deployResult = Shell.exec(
      'npx cdk deploy OrderFlow-VyasaRag --require-approval never',
      { cwd: infraDir }
    );
    if (deployResult.exitCode !== 0) {
      const jiraClient = new JiraClient(jira);
      await jiraClient.addComment(
        ticketId,
        '❌ Release failed: CDK deploy error (VyasaRag).'
      );
      throw new Error('CDK deploy (VyasaRag) failed.');
    }
    deployedStacks = 'OrderFlow-VyasaRag';
  }

  if (infraChanged) {
    let stacksToDeploy = 'OrderFlow-VyasaVector OrderFlow-VyasaRag';
    if (
      /^infra\/lib\/vyasa-ui-stack|^infra\/bin\/app\.ts$/.test(changedFiles)
    ) {
      stacksToDeploy += ' OrderFlow-VyasaUi';
    }
    console.log(`  Deploying CDK stacks: ${stacksToDeploy}`);
    const deployResult = Shell.exec(
      `npx cdk deploy ${stacksToDeploy} --require-approval never`,
      { cwd: infraDir }
    );
    if (deployResult.exitCode !== 0) {
      const jiraClient = new JiraClient(jira);
      await jiraClient.addComment(
        ticketId,
        '❌ Release failed: CDK deploy error. Check terminal for details.'
      );
      throw new Error('CDK deploy failed.');
    }
    deployedStacks = stacksToDeploy;
  }

  if (!uiChanged && !ragChanged && !infraChanged) {
    console.log(
      '  No deployable changes detected (scripts/docs only) — skipping deploy.'
    );
  }

  console.log('[6/8] Capturing stack outputs...');
  const ragStack = new AwsClient('us-east-1').cfnDescribeStack(
    'OrderFlow-VyasaRag'
  );
  const ragEndpoint = ragStack?.outputs['FunctionUrl'] || '';

  const uiStack = new AwsClient('us-east-1').cfnDescribeStack(
    'OrderFlow-VyasaUi'
  );
  const uiBucket = uiStack?.outputs['UiBucketName'] || '';
  const uiDistId = uiStack?.outputs['DistributionId'] || '';
  const uiDomain = uiStack?.outputs['DistributionDomain'] || '';

  if (!uiSynced && uiBucket && uiBucket !== 'None') {
    const distDir = join(repoRoot, 'apps/vyasa-ui/dist');
    if (Shell.test(`test -d ${distDir}`)) {
      console.log('  Syncing UI assets to S3 (from stack output)...');
      Shell.exec(
        `aws s3 sync apps/vyasa-ui/dist/ s3://${uiBucket}/ --delete --cache-control "public,max-age=31536000,immutable" --exclude "index.html" --region us-east-1`,
        { cwd: repoRoot }
      );
      Shell.exec(
        `aws s3 cp apps/vyasa-ui/dist/index.html s3://${uiBucket}/index.html --cache-control "no-cache,no-store,must-revalidate" --region us-east-1`,
        { cwd: repoRoot }
      );

      if (uiDistId) {
        console.log('  Invalidating CloudFront cache...');
        Shell.exec(
          `aws cloudfront create-invalidation --distribution-id ${uiDistId} --paths "/*"`
        );
      }
    }
  }

  console.log('[7/8] Running smoke tests...');
  let smokePass = true;

  if (ragEndpoint) {
    console.log('  Polling RAG health (up to 60s for Lambda cold start)...');
    let ragOk = false;
    for (let i = 0; i < 4; i++) {
      const curlResult = Shell.execSilent(
        `curl -sf ${ragEndpoint}/health -o /dev/null --max-time 15`
      );
      if (curlResult.exitCode === 0) {
        ragOk = true;
        break;
      }
      Shell.exec('sleep 15');
    }
    if (ragOk) {
      console.log(`  ✅ RAG: ${ragEndpoint}/health`);
    } else {
      console.log(`  ❌ RAG smoke test failed: ${ragEndpoint}/health`);
      smokePass = false;
    }
  } else {
    console.log(
      '  ⚠️  RAG endpoint not found in stack outputs — skipping RAG smoke test'
    );
  }

  if (uiDomain) {
    console.log('  Polling UI (up to 60s for CloudFront propagation)...');
    let uiOk = false;
    for (let i = 0; i < 4; i++) {
      const curlResult = Shell.execSilent(
        `curl -sf https://${uiDomain} -o /dev/null --max-time 15`
      );
      if (curlResult.exitCode === 0) {
        uiOk = true;
        break;
      }
      Shell.exec('sleep 15');
    }
    if (uiOk) {
      console.log(`  ✅ UI: https://${uiDomain}`);
    } else {
      console.log(`  ❌ UI smoke test failed: https://${uiDomain}`);
      smokePass = false;
    }
  } else {
    console.log(
      '  ⚠️  UI domain not found in stack outputs — skipping UI smoke test'
    );
  }

  if (!smokePass) {
    console.log('');
    console.log('❌ Smoke tests failed — initiating auto-rollback...');
    const jiraClient = new JiraClient(jira);
    await jiraClient.addComment(
      ticketId,
      '❌ Release smoke tests failed after CDK deploy. Initiating auto-rollback to main~1 state.'
    );

    const rollbackCommitResult = Shell.execSilent(`cat ${releaseMarkerPath}`);
    const rollbackCommit = rollbackCommitResult.stdout.trim();

    if (rollbackCommit) {
      console.log(
        `  Checking out infra/apps from ${rollbackCommit.substring(0, 8)}...`
      );
      Shell.exec(
        `git checkout ${rollbackCommit} -- infra/ apps/vyasa-rag-service/ apps/vyasa-ui/ 2>/dev/null || true`,
        { cwd: repoRoot }
      );
      const rbStacks =
        deployedStacks ||
        'OrderFlow-VyasaVector OrderFlow-VyasaRag OrderFlow-VyasaUi';
      Shell.exec(`npx cdk deploy ${rbStacks} --require-approval never`, {
        cwd: infraDir,
      });
      Shell.exec(
        'git checkout HEAD -- infra/ apps/vyasa-rag-service/ apps/vyasa-ui/ 2>/dev/null || true',
        { cwd: repoRoot }
      );
      console.log('  Rollback deploy complete.');
    } else {
      console.log('  No rollback marker found — manual intervention required.');
    }

    await jiraClient.addComment(
      ticketId,
      `❌ Release FAILED for ${ticketId}. Smoke tests failed post-deploy. Auto-rollback to ${rollbackCommit.substring(0, 8)} attempted. Verify production manually.`
    );
    throw new Error('Smoke tests failed');
  }

  const deployEnd = Date.now();
  const elapsed = Math.round((deployEnd - deployStart) / 1000);

  console.log('[8/8] Updating Jira...');
  const jiraClient = new JiraClient(jira);
  await jiraClient.transitionTo(ticketId, 'Done');

  const deployedCommitResult = Shell.execSilent('git rev-parse --short HEAD');
  const deployedCommit = deployedCommitResult.stdout.trim();

  const summaryBody = `✅ Release Complete — ${ticketId}

Deployed commit: ${deployedCommit}
Duration: ${elapsed}s
AWS Account: ${awsAccount}

Stack Outputs:
- RAG Endpoint: ${ragEndpoint || 'N/A'}
- UI Domain: https://${uiDomain || 'N/A'}
- UI S3 Bucket: ${uiBucket || 'N/A'}
- CloudFront ID: ${uiDistId || 'N/A'}

Smoke Tests: ✅ All passed

Feature is live in production.`;

  await jiraClient.addComment(ticketId, summaryBody);

  console.log('');
  console.log('======================================');
  console.log(` RELEASE COMPLETE: ${ticketId}`);
  console.log('======================================');
  console.log('');
  console.log(`  Commit:   ${deployedCommit}`);
  console.log(`  Duration: ${elapsed}s`);
  console.log(`  RAG:      ${ragEndpoint || 'N/A'}`);
  console.log(`  UI:       https://${uiDomain || 'N/A'}`);
  console.log(`  Ticket:   ${jira.baseUrl}/browse/${ticketId}`);
}
