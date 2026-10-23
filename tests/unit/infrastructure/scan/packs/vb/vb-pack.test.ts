import { describe, expect, it } from 'vitest';
import type { PackSymbol } from '../../../../../../src/application/ports/language-pack.js';
import { VbPack } from '../../../../../../src/infrastructure/scan/packs/vb/vb-pack.js';
import { LanguagePackRegistry } from '../../../../../../src/infrastructure/scan/packs/pack-registry.js';
import { analyseWithPacks } from '../../../../../../src/infrastructure/scan/packs/pack-scan.js';
import { SecretMasker } from '../../../../../../src/infrastructure/guards/secret-masker.js';
import { bytesReader } from '../../../../../support/bytes-reader.js';
import { FixedClock } from '../../../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../../../support/memory-logger.js';
import { languagePackContract } from '../../../../../contracts/language-pack.contract.js';

// Synthetic fixture: invented names only.
const module1 = `Imports System.Data.SqlClient

Namespace Demo
    Public Class ThingRepo
        Private _name As String

        Public Property Name As String

        Public Property Title() As String
            Get
                Return _name
            End Get
            Set(value As String)
                _name = value
            End Set
        End Property

        Public Sub Save(ByVal id As Integer)
            Dim sql = "INSERT INTO tblThing (Id) VALUES (1)"
        End Sub

        Public Function Load() As Integer
            Return 1
        End Function

        ' End Sub in a comment
        Private Shared Function Count() As Integer
            Return 0
        End Function
    End Class
End Namespace

Module Helpers
    Sub Main()
    End Sub
End Module
`;

const pack = new VbPack();

function shape(symbols: readonly PackSymbol[]): string[] {
  return symbols.map(
    (s) => `${s.kind}:${s.name}:${String(s.startLine)}-${String(s.endLine)}:${s.container ?? ''}`,
  );
}

languagePackContract('VbPack', () => Promise.resolve(new VbPack()), {
  path: 'Module1.vb',
  text: module1,
});

describe('VB.NET pack', () => {
  it('RF-111 records classes, modules, Subs, Functions and Properties with their line ranges', () => {
    const { symbols } = pack.analyse({ path: 'Module1.vb', text: module1 });

    expect(shape(symbols)).toEqual([
      'class:ThingRepo:4-30:Demo',
      'property:Name:7-7:Demo.ThingRepo',
      'property:Title:9-16:Demo.ThingRepo',
      'method:Save:18-20:Demo.ThingRepo',
      'method:Load:22-24:Demo.ThingRepo',
      'method:Count:27-29:Demo.ThingRepo',
      'class:Helpers:33-36:',
      'method:Main:34-35:Helpers',
    ]);
  });
});

describe('VB.NET pack declarations', () => {
  it('RF-111 reads keywords in any letter case and skips attributes and modifiers', () => {
    const text = `<Serializable()> _
PUBLIC MUSTINHERIT CLASS Shape
    <Obsolete> Public Overridable Sub Draw()
    end sub
    Public MustOverride Function Area() As Double
    Public Shared Operator +(a As Shape, b As Shape) As Shape
    End Operator
End class
`;
    const { symbols } = pack.analyse({ path: 'Shape.vb', text });

    expect(shape(symbols)).toEqual([
      'class:Shape:2-8:',
      'method:Draw:3-4:Shape',
      'method:Area:5-5:Shape',
    ]);
  });

  it('RF-111 gives interface members and enums, and leaves strings and comments alone', () => {
    const text = `Public Interface IThing
    Sub Run()
    Function Name() As String
End Interface
Public Enum Colour
    Red
End Enum
Structure Pair
    Dim s As String = "Class Fake" ' Sub Hidden()
End Structure
`;
    const { symbols } = pack.analyse({ path: 'T.vb', text });

    expect(shape(symbols)).toEqual([
      'interface:IThing:1-4:',
      'method:Run:2-2:IThing',
      'method:Name:3-3:IThing',
      'enum:Colour:5-7:',
      'struct:Pair:8-10:',
    ]);
  });
});

describe('VB.NET pack bodies and registration', () => {
  it('RF-111 does not end a Sub at the End Sub of a multi-line lambda, and ends an unclosed block at the file end', () => {
    const text = `Class Worker
    Partial Private Sub Hook()
    Sub Run()
        Dim act = Sub()
                      Console.WriteLine()
                  End Sub
        Dim f = Function(x) x + 1
    End Sub
    Sub Open()
`;
    const { symbols } = pack.analyse({ path: 'W.vb', text });

    expect(shape(symbols)).toEqual([
      'class:Worker:1-10:',
      'method:Hook:2-2:Worker',
      'method:Run:3-8:Worker',
      'method:Open:9-10:Worker',
    ]);
  });

  it('RF-111 is registered for .vb files and marks them symbols (mutation: without the pack they stay coarse)', async () => {
    const run = async (packs: readonly VbPack[]) =>
      analyseWithPacks({
        files: [
          { path: 'Module1.vb', language: 'vb', lines: 36, estimatedTokens: 1, artefactKinds: [] },
        ],
        reader: bytesReader({ 'Module1.vb': module1 }),
        registry: new LanguagePackRegistry(packs),
        logger: new MemoryLogger(new FixedClock('2026-10-11T09:00:00.000Z'), new SecretMasker()),
        maxFileBytes: 100_000,
      });

    const withPack = await run([pack]);
    const without = await run([]);

    expect(withPack.fileLevels).toEqual([{ path: 'Module1.vb', mapLevel: 'symbols' }]);
    expect(withPack.symbols.length).toBe(8);
    expect(without.fileLevels).toEqual([{ path: 'Module1.vb', mapLevel: 'coarse' }]);
    expect(without.symbols).toEqual([]);
  });
});
