# Phase 5 credential review

Scope: local profile persistence, environment references, and optional OS keychain
storage. The review guided the persistence boundary: only validated unresolved
fields are eligible for the configuration file; literal passwords are transient.

## Boundaries and controls

- Profile routes inherit the API's loopback Host and same-origin browser checks.
  They do not accept a destination file path. The server selects its configuration
  directory; tests inject their own temporary store.
- Configuration uses an explicit flat field schema. Unknown fields, plaintext
  `config.password`, and credential-bearing URLs or password assignments are
  rejected. A literal top-level password is discarded unless the caller chooses
  keychain storage. Serialized records omit that input entirely.
- Environment password fields must be a single `${VARIABLE}` reference.
  References resolve on reconnect, only once, and values are not persisted.
  Missing or invalid typed variables produce errors without returning their values.
- Public profile responses omit private keychain identifiers and path-base
  metadata. Public connection responses omit configuration. Neither API response
  includes keychain contents or resolved credentials; adapter and native errors
  are replaced with generic actionable messages.
- Keychain storage requires explicit selection. Entries are isolated by random
  identifiers within the `db-explorer` service. Linux requires persistent Secret
  Service rather than a kernel-keyring fallback. A transient reconnect password
  can override an unavailable entry without changing its stored value.
- Profile files use atomic replacement and cross-process locking; private file
  and directory modes apply on POSIX. Windows inherits the user's configuration
  directory permissions. Strict version validation preserves malformed existing
  files rather than silently replacing them.
- Password replacement stages a new entry and removes the old one. Detected file
  write failures restore the previous entry and remove the staged secret. Profile
  deletion removes the keychain entry and restores it if the file write fails.

## Verification and limits

Unit and API tests inspect files and responses for secret markers, exercise
prompted/environment/keychain sources, and test native error redaction. Substitute
keychains cover rotation, deletion, missing or locked entries, and file-write
rollback. Browser tests reconnect after an actual server restart on another port.
No real credential store is modified by the automated tests.

The configuration file and OS keychain are separate systems, so updates cannot be
fully atomic across a process crash or a keychain failure during rollback. A
missing keychain entry falls back to a password prompt. Profiles are local to the
OS user; the API's loopback restriction is not an authentication boundary against
other processes running as that same user. Database read-only enforcement remains
with the adapter. Profiling preferences do not enable any data scans in Phase 5.
