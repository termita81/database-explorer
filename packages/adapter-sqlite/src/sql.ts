import type {
  CheckConstraint,
  PrimaryKey,
  UniqueConstraint,
} from '@db-explorer/core';

interface Token {
  value: string;
  kind: 'word' | 'quoted' | 'symbol';
  start: number;
  end: number;
}

// Only lex schema text. Expressions are preserved as text and never executed.
const isWordCharacter = (character: string) =>
  /[a-zA-Z0-9_$]/.test(character) || character.charCodeAt(0) >= 0x80;

function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let position = 0;
  while (position < sql.length) {
    const start = position;
    const character = sql[position]!;
    if (/[ \t\n\r\f\v]/.test(character)) {
      position++;
      continue;
    }
    if (sql.startsWith('--', position)) {
      const newline = sql.indexOf('\n', position + 2);
      position = newline < 0 ? sql.length : newline + 1;
      continue;
    }
    if (sql.startsWith('/*', position)) {
      const end = sql.indexOf('*/', position + 2);
      position = end < 0 ? sql.length : end + 2;
      continue;
    }
    if ('\'"`['.includes(character)) {
      const closing = character === '[' ? ']' : character;
      let value = '';
      position++;
      while (position < sql.length) {
        const current = sql[position++]!;
        if (current === closing) {
          if (closing !== ']' && sql[position] === closing) {
            value += closing;
            position++;
          } else {
            break;
          }
        } else {
          value += current;
        }
      }
      tokens.push({ value, kind: 'quoted', start, end: position });
      continue;
    }
    if (isWordCharacter(character)) {
      position++;
      while (position < sql.length && isWordCharacter(sql[position]!))
        position++;
      tokens.push({
        value: sql.slice(start, position),
        kind: 'word',
        start,
        end: position,
      });
      continue;
    }
    position++;
    tokens.push({ value: character, kind: 'symbol', start, end: position });
  }
  return tokens;
}

function keyword(token: Token | undefined, value: string): boolean {
  return token?.kind === 'word' && token.value.toUpperCase() === value;
}
function symbol(token: Token | undefined, value: string): boolean {
  return token?.kind === 'symbol' && token.value === value;
}
function closingParenthesis(tokens: Token[], opening: number): number {
  let depth = 0;
  for (let index = opening; index < tokens.length; index++) {
    if (symbol(tokens[index], '(')) depth++;
    if (symbol(tokens[index], ')') && --depth === 0) return index;
  }
  throw new Error('Unbalanced parentheses in stored schema SQL.');
}
function splitTerms(tokens: Token[]): Token[][] {
  const parts: Token[][] = [];
  let start = 0;
  for (let index = 0; index < tokens.length; index++) {
    if (symbol(tokens[index], '(')) index = closingParenthesis(tokens, index);
    else if (symbol(tokens[index], ',')) {
      parts.push(tokens.slice(start, index));
      start = index + 1;
    }
  }
  if (start < tokens.length) parts.push(tokens.slice(start));
  return parts;
}
function columnList(tokens: Token[], opening: number): string[] {
  const closing = closingParenthesis(tokens, opening);
  return splitTerms(tokens.slice(opening + 1, closing)).map(
    (part) => part[0]!.value,
  );
}
function constraintName(tokens: Token[], index: number): { name?: string } {
  return keyword(tokens[index - 2], 'CONSTRAINT')
    ? { name: tokens[index - 1]!.value }
    : {};
}

export interface DeclaredForeignKey {
  name?: string;
  columns: string[];
  referencedTable: string;
  referencedColumns?: string[];
}
export interface DeclaredConstraints {
  primaryKey?: PrimaryKey;
  uniqueConstraints: UniqueConstraint[];
  checkConstraints: CheckConstraint[];
  foreignKeys: DeclaredForeignKey[];
}

export function readDeclaredConstraints(sql: string): DeclaredConstraints {
  const result: DeclaredConstraints = {
    uniqueConstraints: [],
    checkConstraints: [],
    foreignKeys: [],
  };
  const tokens = tokenize(sql);
  const tableKeyword = tokens.findIndex((token) => keyword(token, 'TABLE'));
  if (tokens.slice(0, tableKeyword).some((token) => keyword(token, 'VIRTUAL')))
    return result;
  const opening = tokens.findIndex((token) => symbol(token, '('));
  if (opening < 0) return result;
  const closing = closingParenthesis(tokens, opening);
  for (const definition of splitTerms(tokens.slice(opening + 1, closing))) {
    const first = definition[0];
    const tableConstraint = [
      'CONSTRAINT',
      'PRIMARY',
      'UNIQUE',
      'CHECK',
      'FOREIGN',
    ].some((value) => keyword(first, value));
    const column = tableConstraint ? undefined : first?.value;
    // Skip the column identifier, even if its quoted spelling is a keyword.
    for (
      let index = tableConstraint ? 0 : 1;
      index < definition.length;
      index++
    ) {
      const token = definition[index];
      const name = constraintName(definition, index);
      if (keyword(token, 'PRIMARY') && keyword(definition[index + 1], 'KEY')) {
        const columns =
          column === undefined ? columnList(definition, index + 2) : [column];
        result.primaryKey = { ...name, columns };
      } else if (keyword(token, 'UNIQUE')) {
        const columns =
          column === undefined ? columnList(definition, index + 1) : [column];
        result.uniqueConstraints.push({ ...name, columns });
      } else if (
        keyword(token, 'CHECK') &&
        symbol(definition[index + 1], '(')
      ) {
        const end = closingParenthesis(definition, index + 1);
        result.checkConstraints.push({
          ...name,
          expression: sql
            .slice(definition[index + 1]!.end, definition[end]!.start)
            .trim(),
        });
        index = end;
      } else if (
        keyword(token, 'FOREIGN') &&
        keyword(definition[index + 1], 'KEY')
      ) {
        const end = closingParenthesis(definition, index + 2);
        const reference = definition.findIndex(
          (token, position) => position > end && keyword(token, 'REFERENCES'),
        );
        if (reference >= 0) {
          result.foreignKeys.push(
            readReference(
              definition,
              reference,
              columnList(definition, index + 2),
              name,
            ),
          );
        }
        // The table-level reference is already consumed; don't also treat it as an inline one.
        index = definition.length;
      } else if (column !== undefined && keyword(token, 'REFERENCES')) {
        result.foreignKeys.push(
          readReference(definition, index, [column], name),
        );
      } else if (symbol(token, '(')) {
        index = closingParenthesis(definition, index);
      }
    }
  }
  return result;
}

function readReference(
  tokens: Token[],
  index: number,
  columns: string[],
  name: { name?: string },
): DeclaredForeignKey {
  return {
    ...name,
    columns,
    referencedTable: tokens[index + 1]!.value,
    ...(symbol(tokens[index + 2], '(')
      ? { referencedColumns: columnList(tokens, index + 2) }
      : {}),
  };
}

export function readIndexDefinition(sql: string): {
  expressions: string[];
  predicate?: string;
} {
  const tokens = tokenize(sql);
  const on = tokens.findIndex((token) => keyword(token, 'ON'));
  const opening = tokens.findIndex(
    (token, index) => index > on && symbol(token, '('),
  );
  if (on < 0 || opening < 0)
    throw new Error('Invalid CREATE INDEX statement in stored schema.');
  const closing = closingParenthesis(tokens, opening);
  const expressions = splitTerms(tokens.slice(opening + 1, closing)).map(
    (term) => {
      let end = term.length;
      if (keyword(term[end - 1], 'ASC') || keyword(term[end - 1], 'DESC'))
        end--;
      if (keyword(term[end - 2], 'COLLATE')) end -= 2;
      return sql.slice(term[0]!.start, term[end - 1]!.end).trim();
    },
  );
  const where = tokens.findIndex(
    (token, index) => index > closing && keyword(token, 'WHERE'),
  );
  let end = tokens.length;
  if (symbol(tokens[end - 1], ';')) end--;
  return {
    expressions,
    ...(where >= 0
      ? {
          predicate: sql.slice(tokens[where]!.end, tokens[end - 1]!.end).trim(),
        }
      : {}),
  };
}
