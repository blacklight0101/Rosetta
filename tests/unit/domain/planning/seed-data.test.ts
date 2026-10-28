import { describe, expect, it } from 'vitest';
import { statedSeeds } from '../../../../src/domain/planning/seed-data.js';
import type { SourceCard } from '../../../../src/domain/planning/plan-sources.js';

// P5-42, RF-632: the seed data and the test data the supported claims state, masked where secret.

function card(...claims: [string, 'Supported' | 'Rejected'][]): SourceCard {
  return {
    ...{ id: 'ENT-001', type: 'ENT', title: 'Login', summary: 's', area: 'a' },
    claims: claims.map(([text, status], at) => ({
      claimId: `ENT-001.c${String(at + 1)}`,
      text,
      status,
      citations: [{ path: 'db/Insertions.sql', startLine: 16, endLine: 16 }],
    })),
  };
}

describe('statedSeeds', () => {
  it('P5-42 lists an insert of a schema script as seed data', () => {
    const seeds = statedSeeds([card(["INSERT INTO Dept VALUES (1, 'Surgery')", 'Supported'])]);

    expect(seeds).toHaveLength(1);
    expect(seeds[0]).toMatchObject({ kind: 'seed', masked: false });
    expect(seeds[0]?.text).toContain('Surgery');
  });

  it('P5-42 masks the values of an insert into a login table and the value after a secret word', () => {
    const seeds = statedSeeds([
      card(
        ["INSERT INTO LoginTable VALUES ('admin@clinic.com','hunter2',3)", 'Supported'],
        ['The seed sets password: hunter2 for the admin', 'Supported'],
      ),
    ]);

    expect(seeds.map((seed) => seed.masked)).toEqual([true, true]);
    expect(JSON.stringify(seeds)).not.toContain('hunter2');
    expect(JSON.stringify(seeds)).not.toContain('admin@clinic.com');
  });

  it('P5-42 lists test data apart from seed data, and skips unsupported claims and plain claims', () => {
    const seeds = statedSeeds([
      card(
        ['The suite uses test data of three doctors', 'Supported'],
        ['INSERT INTO Dept VALUES (2)', 'Rejected'],
        ['The page shows a table', 'Supported'],
      ),
    ]);

    expect(seeds.map((seed) => seed.kind)).toEqual(['test']);
  });
});

describe('statedSeeds: a claim that may tell of a secret', () => {
  it.each([
    "INSERT INTO dbo.Users VALUES ('dave','LEAK1')",
    "INSERT INTO [dbo].[Users] VALUES ('dave','LEAK1')",
    "INSERT INTO public.app_user VALUES (1, 'LEAK1')",
    "INSERT INTO tblLogin VALUES ('dave','LEAK1')",
    "INSERT INTO AppUser (Name, Secret) VALUES ('dave','LEAK1')",
    "INSERT INTO Users VALUES (1,'x',987654)",
    'INSERT INTO Users VALUES (1,0x5f4dcc3b5aa765d61d8327deb882cf99)',
    `INSERT INTO Users VALUES ('${'LEAK1'.repeat(100)}')`,
    'INSERT INTO [dbo].[Member Accounts] VALUES (1, LEAK1)',
    "INSERT INTO Employees (Email, PasswordHash) VALUES ('m@x.com','$2a$10$LEAK1')",
    'The seed stores the password hash 5f4dcc3b5aa765d6LEAK1',
    'The seed gives the admin the password to hunter9',
    'The seed sets the password LEAK6',
    'Seeded config has the API key sk_live_LEAK7',
    'Seed data: the apikey LEAK8 and the salt LEAK9',
    "Seed data: the password: 'LEAK1'",
    "INSERT INTO Staff (Name, Pin) VALUES ('sam','LEAK26')",
    "INSERT INTO Employees (Name, Pass) VALUES ('tom','LEAK27')",
    "INSERT INTO Operators (name, passcode) VALUES ('op','LEAK29')",
    "The seed updates Users SET Pass = 'LEAK30'",
    "INSERT INTO Staff (Name, Pass_Word) VALUES ('tom','LEAK31')",
    'The seed sets p@ssword LEAK32',
    "INSERT INTO Personas (nombre, clave) VALUES ('ana','LEAK33')",
    "INSERT INTO Contactos (nombre, contrasena) VALUES ('ana','LEAK34')",
    "INSERT INTO Contatos (nome, senha) VALUES ('ana','LEAK35')",
    "INSERT INTO Usuarios VALUES ('ana','LEAK36')",
    "INSERT INTO Admins VALUES ('root','LEAK37')",
    "INSERT INTO Operadores VALUES ('op','LEAK38')",
  ])('P5-42 leaks nothing of a secret claim: %s', (text) => {
    const [seed] = statedSeeds([card([text, 'Supported'])]);

    expect(seed?.masked).toBe(true);
    expect(seed?.text).not.toMatch(/LEAK|987654|0x5f|hunter9|5f4dcc|sk_live|dave/u);
  });
});

describe('statedSeeds: the text kept', () => {
  it('P5-42 the mask follows the kept text with one space', () => {
    const [seed] = statedSeeds([card(["INSERT INTO Users VALUES (1, 'x')", 'Supported'])]);

    expect(seed?.text).toBe('INSERT INTO Users VALUES ***');
  });

  it('P5-42 a claim with no secret is listed as written and not marked masked', () => {
    const [seed] = statedSeeds([
      card(["INSERT INTO Dept VALUES (1, 'Surgery', 987654)", 'Supported']),
    ]);

    expect(seed).toMatchObject({ masked: false });
    expect(seed?.text).toContain('987654');
  });
});

describe('statedSeeds: identifiers are read as words', () => {
  it.each([
    "INSERT INTO Staff (Name, Pin_Code) VALUES ('sam','LEAK40')",
    "INSERT INTO Staff (Name, PinCode) VALUES ('sam','LEAK41')",
    "INSERT INTO Staff (Name, StaffPin) VALUES ('sam','LEAK42')",
    "INSERT INTO Staff (Name, EmployeePin) VALUES ('sam','LEAK43')",
    "INSERT INTO Staff (Name, pin_no) VALUES ('sam','LEAK44')",
    "INSERT INTO Staff (Name, PIN_NUMBER) VALUES ('sam','LEAK45')",
    "INSERT INTO Staff (Name, userpassword) VALUES ('sam','LEAK46')",
    "INSERT INTO Staff (Name, APIKey) VALUES ('sam','LEAK47')",
    "INSERT INTO Staff (Name, otp_secret) VALUES ('sam','LEAK48')",
    "INSERT INTO Staff (Name, passwordhash) VALUES ('sam','LEAK49')",
    "INSERT INTO Staff (Name, Otp) VALUES ('sam','LEAK50')",
    "INSERT INTO Cards (Name, Cvv2) VALUES ('sam','LEAK51')",
    "INSERT INTO Staff (Name, StaffSalt) VALUES ('sam','LEAK52')",
  ])('P5-42 leaks nothing of a secret identifier: %s', (text) => {
    const [seed] = statedSeeds([card([text, 'Supported'])]);

    expect(seed?.masked).toBe(true);
    expect(seed?.text).not.toContain('LEAK');
  });

  it.each([
    "INSERT INTO Dept (Name) VALUES ('spinner')",
    "INSERT INTO Dept (Name) VALUES ('compass')",
    "INSERT INTO Dept (Name) VALUES ('passenger')",
    "INSERT INTO Dept (Name) VALUES ('keyboard')",
    "INSERT INTO Dept (Name, Spinning, Bypass) VALUES ('a', 1, 2)",
  ])('P5-42 an ordinary word that holds a short secret word is not cut: %s', (text) => {
    const [seed] = statedSeeds([card([text, 'Supported'])]);

    expect(seed).toMatchObject({ masked: false, text });
  });
});

describe('statedSeeds: upper case names and hostile input', () => {
  it.each([
    "INSERT INTO STAFF (NAME, USERPWD) VALUES ('sam','LEAK60')",
    "INSERT INTO STAFF (NAME, PINCODE) VALUES ('sam','LEAK61')",
    "INSERT INTO STAFF (NAME, USERPASS) VALUES ('sam','LEAK62')",
    "INSERT INTO STAFF (NAME, HASHEDPWD) VALUES ('sam','LEAK63')",
    "INSERT INTO STAFF (NAME, userpwd) VALUES ('sam','LEAK64')",
  ])('P5-42 leaks nothing of an upper case secret name: %s', (text) => {
    const [seed] = statedSeeds([card([text, 'Supported'])]);

    expect(seed?.masked).toBe(true);
    expect(seed?.text).not.toContain('LEAK');
  });

  it('P5-42 a hostile claim of 100 000 capitals is read in linear time', () => {
    // A hang guard, not a speed check: the two reads take about 5 ms alone (400 times the limit).
    const started = performance.now();

    statedSeeds([card([`INSERT INTO Dept VALUES ('${'A'.repeat(100_000)}')`, 'Supported'])]);
    statedSeeds([card([`seed ${'AB'.repeat(50_000)}`, 'Supported'])]);

    expect(performance.now() - started).toBeLessThan(2000);
  });
});
