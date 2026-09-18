import { describe, it, expect } from 'vitest';
import { detectDialect, quoteIdent, placeholder, forUpdateByIdAndBusiness } from '../src/dialect';

describe('detectDialect', () => {
  it('detects mysql/mariadb from the URL, else postgres', () => {
    expect(detectDialect('mysql://u:p@h:3306/db')).toBe('mysql');
    expect(detectDialect('mariadb://u:p@h:3306/db')).toBe('mysql');
    expect(detectDialect('postgresql://u:p@h:5432/db')).toBe('postgresql');
    expect(detectDialect('postgres://u:p@h:5432/db')).toBe('postgresql');
    expect(detectDialect(undefined)).toBe('postgresql');
  });
});

describe('quoteIdent', () => {
  it('quotes for each dialect', () => {
    expect(quoteIdent('Event', 'postgresql')).toBe('"Event"');
    expect(quoteIdent('Event', 'mysql')).toBe('`Event`');
  });
});

describe('placeholder', () => {
  it('uses $n for postgres and ? for mysql', () => {
    expect(placeholder(1, 'postgresql')).toBe('$1');
    expect(placeholder(2, 'postgresql')).toBe('$2');
    expect(placeholder(1, 'mysql')).toBe('?');
  });
});

describe('forUpdateByIdAndBusiness', () => {
  it('builds a portable Postgres lock', () => {
    expect(forUpdateByIdAndBusiness('Employee', 'id', 'postgresql')).toBe(
      'SELECT id FROM "Employee" WHERE id = $1 AND "businessId" = $2 FOR UPDATE',
    );
  });
  it('builds a portable MySQL lock', () => {
    expect(forUpdateByIdAndBusiness('Event', 'id, capacity, status', 'mysql')).toBe(
      'SELECT id, capacity, status FROM `Event` WHERE id = ? AND `businessId` = ? FOR UPDATE',
    );
  });
});
