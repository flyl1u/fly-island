# fly-island-plugin

SDK, command-line tool and mock host for [FocuSD Island](https://github.com/TixXin/fly-island) plugins. No runtime dependencies; Node.js 20 or later.

```sh
npm create fly-island-plugin@latest     # start a new plugin
npx fly-island-plugin validate          # check focusd-plugin.json and the folder
npx fly-island-plugin dev               # load the folder into the running island, restart on changes, print the log
npx fly-island-plugin test              # test/*.test.mjs, or a smoke test under the mock host
npx fly-island-plugin pack              # .package/<id>-<version>.zip, byte-for-byte reproducible
npx fly-island-plugin keygen            # once: your signing key; prints the public key for the market submission
npx fly-island-plugin pack --sign       # also <id>-<version>.zip.sig, to attach to the release
npx fly-island-plugin keys rotate       # new key vouched for by the old one; prints the new signingKeys entry
```

Signing is optional, but only signed plugins update by themselves on users' islands, and the island keeps
updates on the key it first saw. Keep the key (`~/.fly-island-plugin/signing.key`, or
`FLY_ISLAND_PLUGIN_SIGNING_KEY` with the PEM text) backed up: a version signed with another key needs every
user's confirmation.

## SDK

```js
import { createPlugin } from "fly-island-plugin"; // or the single file lib/focusd.mjs

const plugin = createPlugin();
plugin.onReady((context) => plugin.log(`started by ${context.activationEvent}`));
plugin.onCommand("hello", () => plugin.notify("Hello from a plugin"));
plugin.views.onVisible("main", (visible) => visible && plugin.views.update("main", { items: [{ id: "1", title: "One" }] }));
plugin.onEvent("todos.changed", async () => plugin.status.update("open", `${(await plugin.todos.list()).todos.length} todos`));
```

Plugins usually carry the SDK as one file (`lib/focusd.mjs`, which `create-fly-island-plugin` copies) so they need nothing installed at run time.

## Mock host

```js
import { startMockHost } from "fly-island-plugin/test";

const host = startMockHost(".", { deny: ["clipboard:read"] });
host.command("hello");
await host.waitFor((state) => state.notifications.length === 1);
await host.stop();
```

Guide (Chinese): [docs/plugins/quickstart.md](https://github.com/TixXin/fly-island/blob/main/docs/plugins/quickstart.md). API reference: [docs/plugins/api.md](https://github.com/TixXin/fly-island/blob/main/docs/plugins/api.md).
