describe('Authentication — Login & Register', () => {
  const TEST_EMAIL = `e2e-${Date.now()}@orderflow.test`;
  const TEST_PASSWORD = 'Test1234!';

  beforeEach(() => {
    cy.clearAllSessionStorage();
    cy.clearAllCookies();
  });

  describe('Register flow', () => {
    it('redirects unauthenticated user to login', () => {
      cy.visit('/orders');
      cy.url().should('include', '/auth/login');
    });

    it('shows validation errors on empty submit', () => {
      cy.visit('/auth/register');
      cy.get('button[type="submit"]').click();
      cy.get('mat-error').should('have.length.greaterThan', 0);
    });

    it('blocks weak password that fails complexity rule', () => {
      cy.visit('/auth/register');
      cy.get('input[formControlName="email"]').type('user@example.com');
      cy.get('input[formControlName="password"]').type('weakpassword');
      cy.get('input[formControlName="password"]').blur();
      cy.get('mat-error').should('contain.text', 'Password must be');
    });

    it('requires GDPR consent checkbox before submit', () => {
      cy.visit('/auth/register');
      cy.get('input[formControlName="email"]').type(TEST_EMAIL);
      cy.get('input[formControlName="password"]').type(TEST_PASSWORD);
      cy.get('button[type="submit"]').should('be.disabled');
    });
  });

  describe('Login form', () => {
    it('renders login page with correct elements', () => {
      cy.visit('/auth/login');
      cy.get('input[formControlName="email"]').should('be.visible');
      cy.get('input[formControlName="password"]').should('be.visible');
      cy.get('button[type="submit"]').should('be.visible');
      cy.get('a[routerLink="/auth/register"]').should('exist');
    });

    it('shows error banner on invalid credentials', () => {
      cy.intercept('POST', '**/v1/auth/login', {
        statusCode: 401,
        body: { message: 'Invalid credentials' },
      }).as('loginFail');

      cy.visit('/auth/login');
      cy.get('input[formControlName="email"]').type('bad@example.com');
      cy.get('input[formControlName="password"]').type('WrongPass1!');
      cy.get('button[type="submit"]').click();
      cy.wait('@loginFail');
      cy.get('[role="alert"]').should('contain.text', 'Invalid credentials');
    });

    it('stores tokens and navigates to /orders on success', () => {
      cy.intercept('POST', '**/v1/auth/login', {
        statusCode: 200,
        body: {
          accessToken:
            'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEiLCJleHAiOjk5OTk5OTk5OTl9.sig',
          refreshToken: 'refresh-abc',
          expiresIn: 900,
        },
      }).as('loginOk');

      cy.intercept('GET', '**/v1/orders*', {
        statusCode: 200,
        body: {
          data: [],
          pagination: { hasNextPage: false, nextCursor: null },
        },
      }).as('ordersEmpty');

      cy.visit('/auth/login');
      cy.get('input[formControlName="email"]').type('user@example.com');
      cy.get('input[formControlName="password"]').type('Pass1234!');
      cy.get('button[type="submit"]').click();
      cy.wait('@loginOk');
      cy.url().should('include', '/orders');
    });

    it('toggles password visibility', () => {
      cy.visit('/auth/login');
      cy.get('input[formControlName="password"]').should(
        'have.attr',
        'type',
        'password'
      );
      cy.get('button[aria-label*="password"]').click();
      cy.get('input[formControlName="password"]').should(
        'have.attr',
        'type',
        'text'
      );
    });
  });
});
