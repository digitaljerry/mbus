# MBus for Apple platforms

Not started yet. Plan: [docs/ios-app-plan.md](../../docs/ios-app-plan.md).

Intended layout:

```
apps/apple/
  MBus.xcodeproj        iOS app, watchOS app, widget + Live Activity extension, App Intents
  MBusKit/              Swift package shared by all targets: API client (mbus.vercel.app/api),
                        models, Europe/Ljubljana time rules, storage (App Group)
```

The app talks only to the MBus API in `apps/web` (never to brezavta or Marprom directly),
so data fixes ship once, on the server.
