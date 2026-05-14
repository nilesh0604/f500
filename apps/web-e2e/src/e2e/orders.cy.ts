import { MOCK_TOKEN, mockOrders } from '../fixtures/test-data';

describe('Order List — Screen 2', () => {
  beforeEach(() => {
    cy.intercept('GET', '**/v1/orders*', {
      statusCode: 200,
      body: {
        data: mockOrders,
        pagination: { hasNextPage: false, nextCursor: null },
      },
    }).as('getOrders');

    cy.visit('/orders', {
      onBeforeLoad(win) {
        win.sessionStorage.setItem('of_access_token', MOCK_TOKEN);
      },
    });
    cy.wait('@getOrders');
  });

  it('displays orders table with correct columns', () => {
    cy.get('table[aria-label="Orders list"]').should('be.visible');
    cy.get('th').should('contain.text', 'Item');
    cy.get('th').should('contain.text', 'Qty');
    cy.get('th').should('contain.text', 'Status');
    cy.get('th').should('contain.text', 'Created');
  });

  it('renders all order rows', () => {
    cy.get('tr.mat-mdc-row').should('have.length', 2);
    cy.get('tr.mat-mdc-row').first().should('contain.text', 'Laptop Stand');
    cy.get('tr.mat-mdc-row').last().should('contain.text', 'Keyboard');
  });

  it('shows status badges for each order', () => {
    cy.get('app-status-badge').should('have.length', 2);
  });

  it('shows empty state when no orders', () => {
    cy.intercept('GET', '**/v1/orders*', {
      statusCode: 200,
      body: { data: [], pagination: { hasNextPage: false, nextCursor: null } },
    }).as('emptyOrders');

    cy.visit('/orders', {
      onBeforeLoad(win) {
        win.sessionStorage.setItem('of_access_token', MOCK_TOKEN);
      },
    });
    cy.wait('@emptyOrders');
    cy.contains('No orders yet').should('be.visible');
  });

  it('opens Create Order dialog on New Order click', () => {
    cy.get('button[aria-label="Create new order"]').click();
    cy.get('h2[mat-dialog-title]').should('contain.text', 'Create New Order');
    cy.get('input[formControlName="itemName"]').should('be.visible');
  });

  it('closes dialog on Cancel', () => {
    cy.get('button[aria-label="Create new order"]').click();
    cy.get('button').contains('Cancel').click();
    cy.get('h2[mat-dialog-title]').should('not.exist');
  });

  it('submits create order form with correct payload', () => {
    cy.intercept('POST', '**/v1/orders', {
      statusCode: 201,
      body: {
        id: 'order-new',
        userId: 'user-1',
        itemName: 'Monitor',
        quantity: 1,
        notes: null,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }).as('createOrder');

    cy.get('button[aria-label="Create new order"]').click();
    cy.get('input[formControlName="itemName"]').type('Monitor');
    cy.get('input[formControlName="quantity"]').clear().type('1');
    cy.get('button[type="submit"]').last().click();
    cy.wait('@createOrder')
      .its('request.headers')
      .should('have.key', 'idempotency-key');
  });

  it('navigates to order detail on row link click', () => {
    cy.intercept('GET', '**/v1/orders/order-1', {
      statusCode: 200,
      body: mockOrders[0],
    }).as('getOrder');

    cy.contains('a', 'Laptop Stand').click();
    cy.wait('@getOrder');
    cy.url().should('include', '/orders/order-1');
  });
});

describe('Order Detail — Screen 3', () => {
  beforeEach(() => {
    cy.intercept('GET', '**/v1/orders/order-1', {
      statusCode: 200,
      body: mockOrders[0],
    }).as('getOrder');

    cy.visit('/orders/order-1', {
      onBeforeLoad(win) {
        win.sessionStorage.setItem('of_access_token', MOCK_TOKEN);
      },
    });
    cy.wait('@getOrder');
  });

  it('shows order item name in header', () => {
    cy.get('.detail-header__title').should('contain.text', 'Laptop Stand');
  });

  it('renders 4-step status timeline', () => {
    cy.get('[role="list"][aria-label="Order status timeline"]')
      .find('[role="listitem"]')
      .should('have.length', 4);
  });

  it('highlights current status step', () => {
    cy.get('.timeline__step--current').should('exist');
    cy.get('.timeline__step--current').should('contain.text', 'Pending');
  });

  it('shows Mark as Confirmed action button for pending order', () => {
    cy.get('button[aria-label="Advance order status"]').should(
      'contain.text',
      'Confirmed'
    );
  });

  it('advances status on button click', () => {
    cy.intercept('PATCH', '**/v1/orders/order-1/status', {
      statusCode: 200,
      body: { ...mockOrders[0], status: 'confirmed' },
    }).as('updateStatus');

    cy.get('button[aria-label="Advance order status"]').click();
    cy.wait('@updateStatus')
      .its('request.body')
      .should('deep.equal', { status: 'confirmed' });
  });

  it('navigates back to order list', () => {
    cy.intercept('GET', '**/v1/orders*', {
      statusCode: 200,
      body: {
        data: mockOrders,
        pagination: { hasNextPage: false, nextCursor: null },
      },
    }).as('getOrders');

    cy.get('button[aria-label="Back to orders"]').click();
    cy.url().should('match', /\/orders$/);
  });
});
