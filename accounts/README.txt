0f8 Account Service v1

FILES
worker.js.txt             Worker implementation. Rename to worker.js.
schema.sql                New D1 schema.
migration_add_account_info.sql  Add account_info to an existing accounts table.
wrangler.toml             Worker + D1 binding template.
package.json              外部Worker内蔵PBKDF2 npmモジュール 3.0.3 + Wrangler.
client-service.js.txt     Reusable browser client library. Rename to client-service.js.
account-login.html        Login/register popup.
account-login.js.txt      Popup script. Rename to account-login.js.
account-dashboard.html    Account management dashboard.
account-dashboard.js.txt  Dashboard script. Rename to account-dashboard.js.
account-service.css       Shared CSS.
IMPLEMENTATION_NOTES.txt  Fixed protocol decisions and storage formats.

DEPLOY
1. Edit wrangler.toml with the real D1 database name and ID.
2. Execute schema.sql against the bound D1 database.
3. If the existing accounts table already exists without account_info, execute migration_add_account_info.sql instead.
4. Install dependencies with npm install.
5. Set secrets:
   npx wrangler secret put DOMAIN_INDEX_SECRET
   npx wrangler secret put TOKEN_SIGNING_SECRET
   npx wrangler secret put TOKEN_PBKDF2_PEPPER
6. Deploy with npx wrangler deploy.

The Worker expects D1 binding name DB.

CLIENT
After deploying account-login.html, edit client-service.js.txt:
  popupUrl: "https://YOUR-ACCOUNT-SERVICE-PAGE.example/login.html"
Then rename it to client-service.js.

The popup page must be served from HTTPS. The app calling the library must also be HTTPS (localhost/127.0.0.1 are allowed for development).

SERVER TO SERVER INTROSPECTION
POST /v1/auth/introspect
JSON body:
{
  "token": "...",
  "signature": "...",
  "origin": "https://developer.example"
}

For a browser request, Origin is checked. For a server-to-server request, body.origin may be supplied and the account service will validate it against the signed token.

SECURITY NOTE
This v1 A design intentionally permits the client to send the derived data-access key to the account Worker for verification. It is not full E2EE against the account-service operator. Data confidentiality against a database-only compromise is still provided by AES-256-GCM, subject to the current deterministic data-access derivation design.

The Worker uses prepared D1 statements throughout. D1 documents prepared/bound statements as the recommended pattern for parameterized queries, and BLOB values are supported by the binding API. D1 currently permits up to a 2 MB string/BLOB/row, so the 200 KB application-level data budget leaves substantial headroom.
