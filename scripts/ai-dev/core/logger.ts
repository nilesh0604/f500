export class Logger {
  static info(message: string): void {
    console.log(`ℹ️  ${message}`);
  }

  static warn(message: string): void {
    console.log(`⚠️  ${message}`);
  }

  static error(message: string): void {
    console.log(`❌ ${message}`);
  }

  static success(message: string): void {
    console.log(`✅ ${message}`);
  }

  static step(stepName: string, message?: string): void {
    const msg = message ? `: ${message}` : '';
    console.log(`🔶 ${stepName}${msg}`);
  }

  static banner(title: string): void {
    console.log();
    console.log('═'.repeat(60));
    console.log(`  ${title}`);
    console.log('═'.repeat(60));
    console.log();
  }

  static subheader(title: string): void {
    console.log();
    console.log(`─`.repeat(40));
    console.log(`  ${title}`);
    console.log(`─`.repeat(40));
    console.log();
  }

  static dim(message: string): void {
    console.log(message);
  }

  static debug(message: string): void {
    if (process.env.DEBUG) {
      console.log(`🐛 ${message}`);
    }
  }
}
