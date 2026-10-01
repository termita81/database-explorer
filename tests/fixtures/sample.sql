PRAGMA foreign_keys = ON;
CREATE TABLE teams (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE people (id INTEGER PRIMARY KEY, team_id INTEGER REFERENCES teams(id), name TEXT NOT NULL);
INSERT INTO teams VALUES (1, 'Example team');
INSERT INTO people VALUES (1, 1, 'Ada'), (2, NULL, 'Linus');
