PRAGMA foreign_keys = ON;

CREATE TABLE teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE people (
  id INTEGER PRIMARY KEY,
  team_id INTEGER REFERENCES teams(id),
  name TEXT NOT NULL,
  manager_id INTEGER REFERENCES people(id),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  nickname TEXT DEFAULT 'unknown',
  CONSTRAINT people_name_length CHECK (length(name) > 0)
);
CREATE INDEX people_team_name ON people(team_id, name DESC);
CREATE UNIQUE INDEX people_nickname_unique ON people(nickname) WHERE nickname IS NOT NULL;

CREATE TABLE projects (
  project_id INTEGER,
  tenant_id TEXT,
  label TEXT DEFAULT 'Untitled',
  CONSTRAINT project_pk PRIMARY KEY (tenant_id, project_id),
  CONSTRAINT project_label UNIQUE (tenant_id, label),
  CHECK (project_id > 0)
) WITHOUT ROWID;

CREATE TABLE memberships (
  team_id INTEGER NOT NULL REFERENCES teams,
  tenant_id TEXT,
  project_id INTEGER,
  person_id INTEGER NOT NULL REFERENCES people(id),
  role TEXT NOT NULL DEFAULT 'member',
  PRIMARY KEY (team_id, person_id),
  CONSTRAINT membership_project FOREIGN KEY (tenant_id, project_id) REFERENCES projects,
  CONSTRAINT membership_unique UNIQUE (person_id, tenant_id, project_id),
  CONSTRAINT membership_role CHECK (role IN ('member', 'owner'))
);
CREATE INDEX memberships_project ON memberships(tenant_id, project_id);
CREATE VIEW team_names AS SELECT id, name FROM teams;

INSERT INTO teams VALUES (1, 'Example team');
INSERT INTO people (id, team_id, name, nickname) VALUES (1, 1, 'Ada', 'ada'), (2, NULL, 'Linus', 'linus');
INSERT INTO projects VALUES (1, 'example', 'Explorer');
INSERT INTO memberships VALUES (1, 'example', 1, 1, 'owner');
