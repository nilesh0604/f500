declare global {
  namespace Cypress {
    interface Chainable {
      login(email: string, password: string): Chainable<void>;
      checkA11y(context?: string): Chainable<void>;
    }
  }
}

Cypress.Commands.add('login', (email: string, password: string) => {
  cy.session(
    [email, password],
    () => {
      cy.visit('/auth/login');
      cy.get('input[formControlName="email"]').type(email);
      cy.get('input[formControlName="password"]').type(password);
      cy.get('button[type="submit"]').click();
      cy.url().should('include', '/orders');
    },
    {
      cacheAcrossSpecs: true,
    }
  );
});

Cypress.Commands.add('checkA11y', (context?: string) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cyAny = cy as any;
  cyAny.injectAxe();
  cyAny.checkA11y(
    context ?? null,
    {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21aa'],
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (violations: any[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      violations.forEach((v: any) => {
        cy.log(`[a11y] ${v.id}: ${v.description}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        v.nodes.forEach((n: any) => cy.log(n.html));
      });
    }
  );
});

export {};
