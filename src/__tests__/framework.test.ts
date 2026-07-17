import { describe, expect, it } from 'vitest';
import { buildAppNav, buildModuleNav } from '../nav';
import { defineModule, defineResource, createRegistry } from '../registry';
import { initialValues, validateValues } from '../schema';
import type { ResourceSchema } from '../types';

const customer: ResourceSchema = defineResource({
  name: 'customer',
  labelSingular: 'Customer',
  labelPlural: 'Customers',
  endpoint: '/crm/customers',
  permissions: { read: 'crm.customer.read' },
  fields: [
    { name: 'name', label: 'Name', type: 'text', required: true },
    { name: 'email', label: 'Email', type: 'email', required: true },
    {
      name: 'type',
      label: 'Type',
      type: 'select',
      options: [
        { value: 'COMPANY', label: 'Company' },
        { value: 'INDIVIDUAL', label: 'Individual' },
      ],
    },
    {
      name: 'creditLimit',
      label: 'Credit Limit',
      type: 'currency',
      min: 0,
      visibleIf: (v) => v.type === 'COMPANY',
      validate: (value) => (Number(value) > 1_000_000 ? 'Credit limit too high' : null),
    },
  ],
});

const crm = defineModule({
  id: 'crm',
  title: 'CRM',
  basePath: '/crm',
  resources: [customer],
  nav: [{ name: 'Pipeline', href: 'pipeline', permission: 'crm.pipeline.read' }],
});

describe('defineModule', () => {
  it('rejects duplicate resources and bad basePath', () => {
    expect(() => defineModule({ ...crm, resources: [customer, customer] })).toThrow(/duplicate/);
    expect(() => defineModule({ ...crm, basePath: 'crm' })).toThrow(/basePath/);
  });
});

describe('registry', () => {
  it('resolves resources across modules', () => {
    const registry = createRegistry([crm]);
    expect(registry.getResource('customer')?.endpoint).toBe('/crm/customers');
    expect(registry.getResource('missing')).toBeUndefined();
  });
});

describe('validateValues', () => {
  it('flags required and format errors', () => {
    const errors = validateValues(customer, { name: '', email: 'not-an-email', type: '' });
    expect(errors.name).toMatch(/required/i);
    expect(errors.email).toMatch(/email/i);
  });

  it('skips hidden conditional fields but validates visible ones', () => {
    const hidden = validateValues(customer, {
      name: 'Acme',
      email: 'a@b.com',
      type: 'INDIVIDUAL',
      creditLimit: -5,
    });
    expect(hidden.creditLimit).toBeUndefined();

    const visible = validateValues(customer, {
      name: 'Acme',
      email: 'a@b.com',
      type: 'COMPANY',
      creditLimit: -5,
    });
    expect(visible.creditLimit).toMatch(/≥ 0/);
  });

  it('runs custom validators', () => {
    const errors = validateValues(customer, {
      name: 'Acme',
      email: 'a@b.com',
      type: 'COMPANY',
      creditLimit: 2_000_000,
    });
    expect(errors.creditLimit).toBe('Credit limit too high');
  });
});

describe('initialValues', () => {
  it('applies defaults and existing records', () => {
    expect(initialValues(customer).name).toBe('');
    expect(initialValues(customer, { name: 'Acme' }).name).toBe('Acme');
  });
});

describe('navigation', () => {
  it('generates permission-filtered nav', () => {
    const nav = buildModuleNav(crm, (code) => code === 'crm.customer.read');
    expect(nav?.items).toEqual([{ name: 'Customers', href: '/crm/customer' }]);
  });

  it('drops modules with no visible items', () => {
    expect(buildAppNav([crm], () => false)).toEqual([]);
  });

  it('resolves relative custom nav hrefs against basePath', () => {
    const nav = buildModuleNav(crm, () => true);
    expect(nav?.items).toContainEqual({ name: 'Pipeline', href: '/crm/pipeline' });
  });
});
