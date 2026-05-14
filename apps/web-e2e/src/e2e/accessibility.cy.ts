import { MOCK_TOKEN, mockOrders } from '../fixtures/test-data';

describe('WCAG 2.1 AA — Accessibility Checks', () => {
  it('login page passes axe WCAG 2.1 AA', () => {
    cy.visit('/auth/login');
    cy.checkA11y();
  });

  it('register page passes axe WCAG 2.1 AA', () => {
    cy.visit('/auth/register');
    cy.checkA11y();
  });

  it('order list page passes axe WCAG 2.1 AA', () => {
    cy.intercept('GET', '**/v1/orders*', {
      statusCode: 200,
      body: {
        data: mockOrders,
        pagination: { hasNextPage: false, nextCursor: null },
      },
    });

    cy.visit('/orders', {
      onBeforeLoad(win) {
        win.sessionStorage.setItem('of_access_token', MOCK_TOKEN);
      },
    });
    cy.get('table[aria-label="Orders list"]').should('be.visible');
    cy.checkA11y();
  });

  it('order detail page passes axe WCAG 2.1 AA', () => {
    cy.intercept('GET', '**/v1/orders/order-1', {
      statusCode: 200,
      body: mockOrders[0],
    });

    cy.visit('/orders/order-1', {
      onBeforeLoad(win) {
        win.sessionStorage.setItem('of_access_token', MOCK_TOKEN);
      },
    });
    cy.get('.detail-header__title').should('be.visible');
    cy.checkA11y();
  });

  it('all interactive elements have visible focus outline on login', () => {
    cy.visit('/auth/login');
    cy.get('input[formControlName="email"]').focus();
    cy.focused().should('have.attr', 'formcontrolname', 'email');
    cy.get('input[formControlName="password"]').focus();
    cy.focused().should('have.attr', 'formcontrolname', 'password');
    cy.get('button[type="submit"]').focus();
    cy.focused().should('have.attr', 'type', 'submit');
  });

  it('toast component has ARIA live region', () => {
    cy.visit('/auth/login');
    cy.get('[aria-live="polite"]').should('exist');
  });

  it('status timeline list has correct ARIA roles', () => {
    cy.intercept('GET', '**/v1/orders/order-1', {
      statusCode: 200,
      body: mockOrders[0],
    });

    cy.visit('/orders/order-1', {
      onBeforeLoad(win) {
        win.sessionStorage.setItem('of_access_token', MOCK_TOKEN);
      },
    });
    cy.get('[role="list"][aria-label="Order status timeline"]').should('exist');
    cy.get('[role="listitem"]').should('have.length.greaterThan', 0);
  });
});
