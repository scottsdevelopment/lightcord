# Lightcord

Very basic example of using this client for debugging purposes:

```
import DiscordClient, {UnknownMessage, DiscordMessage, DiscordEvent } from "./DiscordClient";

const dc = new DiscordClient('yourtokenhere');
dc.on(DiscordEvent.Chat, (json: any) => new DiscordMessage(json));
dc.on(DiscordEvent.Message, (json: any) => new UnknownMessage(json));

dc.connect();
```