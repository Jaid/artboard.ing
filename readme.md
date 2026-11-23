# artboard.ing

A non-destructive image studio for building illustrations through local edits, references, inpainting, outpainting and global restyling. The prompt editor is Monacozen; the workspace is an infinite canvas with independently editable layers.

## Run

```powershell
cd C:/Users/jaid/git/artboard.ing
bun install --frozen-lockfile
bun run dev
```

Vite serves the app at the local URL printed in the terminal.

artboard.ing is a static, client-only app without a backend. Build it and host `dist` anywhere that serves files:

```powershell
bun run build
bun run preview
```

`bun run preview` serves the build at `http://127.0.0.1:4173`.

### Credentials

Every request goes straight from the browser to the image provider. For OpenRouter, enter your key in the popover of the key button next to the project actions. It stays in memory for the tab, goes only along with the requests to OpenRouter (or the host of `?openrouter_host` or `?ai_endpoint`), and is forgotten on reload. It is never included in portable projects or autosaves. `?openrouter_key=sk-or-v1-…` starts the tab with such a key; see [OpenRouter host and key](#openrouter-host-and-key). `?ai_endpoint` needs no OpenRouter key at all; see [Own endpoint](#own-endpoint-cliproxyapi). The production build is scanned for OpenRouter key literals, so a key pasted into the source never gets published.

**Demo mode requires no key and spends no credits.** It creates an explicitly labeled procedural illustration, or applies a procedural treatment to the captured canvas. It is not represented as an AI response. The mode survives reload and New project so a no-credit session does not silently become a paid one.

## Editing workflow

1. Drop a photo onto the canvas, or right-click the canvas and choose **Import images to canvas…**. The first layer becomes the unmasked base. Further imports can be moved, resized and rotated.
2. Drop reference images on the editor, or choose **Add images to collection…** from the canvas context menu. Every image in the collection – imports, generations and snapshots alike – receives a stable positive number as soon as it is added. Deleting an item does not renumber the others or reuse its number.
3. Move the generation frame to the region you want to edit. Corner handles preserve its ratio. Edge handles snap between ratios advertised by the selected model. Handles appear when the pointer touches the frame. While the canvas has no layers, the frame can be neither moved nor scaled; dragging inside it pans the view instead.
4. Write a prompt and press the yellow button, or press **Ctrl+Enter**. A generation captures its input images, prompt, model settings and frame before the request is sent. Moving the frame while it runs cannot change where the result lands.
5. New layers start with a 100% area and no feather, and they are not selected automatically. Click the mask thumbnail next to a layer’s image thumbnail to enter mask edit mode, which hides the generation frame and provides **Area**, **Feather**, roundness and mask translation. Selecting the image thumbnail shows only image-related controls: **Opacity**, **Brightness**, **Contrast**, **Gamma**, **Saturation**, **Vibrance** and **White balance** sliders (double-click one to reset it) and, for generations, **Content-aware alignment**. Dragging inside the selected layer repositions its mask; clicking the mask thumbnail again or pressing Escape leaves the mode.
6. Continue with further local edits, then right-click or click the frame view (tile 0 of the collection) and choose **Export…** for PNG, JPG, WebP or a PNG clipboard copy. Use **Save project** for an editable `.artboarding` backup containing the source assets and request captures.

### The generate button, the frame toggle and shots

The yellow button names what the generation will do with the canvas:

| Label | Situation |
| --- | --- |
| **Generate** | The frame does not touch any canvas content. |
| **Extend** | The frame contains canvas content but also empty canvas. |
| **Patch** | The frame is filled with canvas content and there is more content outside of it. |
| **Transform** | The frame is filled with canvas content and nothing lies outside of it. |

The frame icon next to it switches the frame off and on. While it is off, the frame is hidden and every generation spans all visible canvas content, padded to the closest aspect ratio the model supports. Hovering the button previews that area. **Frame it** and **Frame all artwork** switch the frame back on.

The **shots** dropdown between the frame icon and the yellow button asks for 1–8 images per click. All shots send the very same captured request at the same time, and they land in a single layer as its revisions, just like rerolls: whichever finishes first creates the layer, every further one becomes another revision, so the row reads “generation ‹ 3/4 ›” and the triangles cycle through the takes. Each shot still becomes a collection item and an undo step of its own. While shots run, one overlay over their frame counts them, cancels them together and offers to retry the failed ones; a retry rerolls the layer once a shot has landed. **Reroll** asks for as many shots and reads “Reroll 4×” when that is more than one. The choice survives reload, and `?shots=4` presets it. At most 32 requests run at once – generations, rerolls and transforms together; if a click asks for more than are free, only that many shots start.

### Prompt references

```markdown
Please put ![1] onto the head of ![0]
```

`![0]` is the visible, masked canvas content inside the frame. It is automatically sent first whenever that frame contains artwork, including when other references are explicit:

```markdown
The hand should hold a cup of coffee with ![2] printed on it
```

A reference can carry a description in parentheses. The description is written into the prompt directly before the image:

```markdown
Please add ![2](this witch) to the image
```

is sent as “Please add this witch [image 2] to the image”. Parentheses inside the description may be nested or escaped with a backslash. Something that looks like an image location – a URL, a path, a file name like `logo.png` or `<…>` – keeps its standard Markdown meaning and is never fetched.

Prompts without an explicit reference work as well, for local edits or global restyling:

```markdown
Please put a ring on the finger of ![0]
```

```markdown
Please restyle this to be a beautiful artistic oil painting
```

When framing a local edit, leave some padding around the subject so the model sees style, lighting and proportions.

Only referenced ingredients are sent. Repeated references share an attachment. Missing references, empty prompts, reference limits and explicit `![0]` on an empty frame fail before provider dispatch. Escaped references, code spans and complete standard Markdown image syntax remain literal; they do not trigger arbitrary URL fetching. HTML comments are omitted from generation prompts.

### Canvas and layers

The frame and the images have separate geometry. Generated layers remain pinned to their captured frame. To reuse generated pixels as a movable object, drag the generation’s thumbnail from the collection onto the canvas to place a new imported copy.

Use the **Image** tool to drag imports, resize from a corner or rotate from the round handle. The inspector also provides numerical transform fields. Shift snaps rotation to 15-degree increments; Alt resizes around the center. The base layer at the bottom of the stack anchors the canvas and cannot be moved, resized or rotated.

Right-click the canvas, a layer or a row in the layer inspector for **Frame it**, **Hide layer**, ordering, deletion, framing, zoom, import, snapshot and undo/redo actions. There is no permanent floating canvas toolbar. Double-clicking a layer also frames it. Hidden layers keep a crossed-out eye button in their row to show them again quickly.

**Reroll** in the context menu of a generated layer sends its request again: the same prompt and the very same input images that were captured for it, but the currently selected model, resolution, quality and number of shots. The result becomes another revision of that layer instead of a new layer, and its row reads “generation ‹ 2/3 ›” – the triangles cycle through the revisions. Every revision keeps its own request capture and collection number; mask, adjustments and opacity belong to the layer. Switching revisions is a single undo step.

The collection below the editor is a row-wrapping strip of equally tall thumbnails, each tagged with its number. Position 0 is a live view of `![0]` – the canvas inside the frame, or the generation area while the frame is off – which updates as the frame or the artwork changes. It can be dragged into the prompt like any other tile, but not removed or placed on the canvas. Thumbnails keep the image’s aspect ratio between 2:3 and 2:1; taller or wider images are cropped, which tiny arrows on the cropped edges indicate. Drag a thumbnail into the editor to insert its reference, or onto the canvas to place a movable copy there. While a thumbnail is dragged over the editor, a caret in the color of the reference marks the exact spot between two characters where it will land, so it can be dropped right in the middle of a sentence; a space keeps it apart from the words on either side, but not from punctuation. The badge color tells the kind apart: pink for imports, green for generations and orange for canvas snapshots (**Snapshot the frame into collection** in the canvas context menu). `![0]` always refers to the live canvas inside the frame; its tile is a view, not a stored collection item.

Clicking a thumbnail opens its details: the picture as large as the window allows, its kind, size, format, file size and usage, and next to it the very same menu as its context menu. For a generation, the details also show its prompt (with a copy button), the prompt that was actually sent if references changed it, and the inference details: model, ratio, resolution, quality, reported cost, request time and the input images, numbered like in the prompt the model received. Generations and transforms keep this request capture in their collection item, so it outlives a deleted layer and survives portable projects and autosaves; items from older projects find it in the layer or revision that holds their image. The frame view opens a large live view of `![0]`. While the details are open, ← and → show the previous and next tile in collection order and wrap around at the ends; ↑ jumps to the frame view and ↓ to the last item. Dropdowns keep their arrow keys, and while a menu item is focused, ↑ and ↓ move through the menu instead. Escape, the close button or a click beside the dialog closes it.

Hovering a tile shows a tooltip above it with its name, kind, size and usage. While a tile is hovered, its references in the prompt light up, the layers that use it are outlined on the canvas and their thumbnails are highlighted in the layers panel – or their revision selector, if the image is a revision that is not shown right now. A cropped thumbnail unrolls in place to show the complete picture.

Right-click a tile, or click it and use the menu in its details, for **Rotation**, **Flip**, the **Transform** presets, **Export** and **Delete**. The **Rotation** dropdown turns the image by 0°, 90° clockwise, 90° counterclockwise or 180°; the **Flip** dropdown mirrors it horizontally, vertically or not at all – mirroring both ways would just be a 180° turn. The image is turned first and then mirrored along the axes of the turned picture, so “Horizontal” always mirrors what you see left to right. Both choices are always relative to the original image, which the project keeps: going back to 0° without a flip shows the very original bytes again. The transformed pixels are stored losslessly, and every layer that shows the image – or keeps it as a revision – switches along with it as a single undo step. A quarter turn also turns those layers’ rectangles around their centers, so nothing is stretched; a layer’s own free rotation, mask and adjustments stay as they are. Prompt references, the drag-and-drop copies and **Export** all use the transformed image. A collection image downloads with its current bytes – the original ones unless it is rotated or flipped. Deleting removes it from the collection only; layers that show it keep their pixels. The frame view opens the raster export dialog described below, preset to the frame region.

The **Transform** presets in a tile’s context menu send a fixed instruction with that image as the only input image – for now **Extract subject**: “Extract the subject of this image in high quality on a neutral background”. They ignore the prompt input entirely and use the currently selected model, resolution, quality and frame ratio. The result becomes a new green collection item named after the preset and the source, for example “Extract subject · Witch”; nothing is added to the canvas. While the request runs, a placeholder shaped like the requested ratio stands at the end of the collection with the elapsed time and a cancel button. A failed transform stays there with its error until it is dismissed or retried with the current settings. Transforms share the limit of 32 concurrent requests with generations; they ignore the shots dropdown and always create one item.

### Masks and outpainting

Where the frame has no visible artwork, generation inputs show a flat color, `#333` by default. `?transparent_color=` changes it and accepts any CSS color; write hex values without the “#” (`transparent_color=555`) or encode it as `%23555`, because a literal “#” starts the URL fragment.

Area measures rectangular area: **25% means half the width and half the height**, before corner rounding. Mask position and image position are independent.

Feathering blends where the layer overlaps existing visual coverage. Exposed outpainting edges stay opaque instead of fading away. Enable **Feather exposed edges too** only when that behavior is deliberately desired.

The feather algorithm can be chosen with the `?feather_method=` URL parameter:

| Value | Behavior |
| --- | --- |
| `smooth` (default) | The ramp follows nested rounded rectangles whose corners round off toward the center, so corners show no diagonal crease and there is no ridge along the center line. Straight edges keep exactly the requested feather width. The quintic ramp avoids visible bands where it starts and ends. Where the artwork below a layer ends inside its feather band, the layer turns opaque in a smooth wedge toward that edge, so the edge does not show through as a hard line. |
| `distance` | The original ramp: smoothstep over the exact distance to the mask edge. |

Hovering or selecting a layer reveals its image bounds. Contracted masks add a second outline, and feathering adds an inner transition outline. Viewport rendering, generation inputs, snapshots, clipboard operations and raster exports use the same compositor.

### Export resolution

**Preserve the highest local detail** considers every relevant layer, including small high-resolution patches. It does not ignore a repair merely because the repair covers a small fraction of the canvas.

The export dialog – opened through **Export…** in the frame view’s context menu – can export the frame or all visible artwork. It also provides canvas-scale and custom-scale modes. It displays dimensions and megapixels before export. When full detail exceeds 64 megapixels or a 16,384-pixel edge, the app requires an explicit smaller scale/frame or permission to reduce the output. It does not silently discard local detail.

A portable project preserves editable normalized assets, geometry, masks, references and original request/output captures. Raster exports are flattened. This edition does not claim to vectorize generated images.

### Storage and recovery

The workspace autosaves to IndexedDB using atomic image/document transactions. Failed recovery pauses autosave rather than overwriting recoverable data. The UI prevents editing during initial recovery. **New** explicitly clears the document, references, prompt and history; it offers a save-copy option first. **Open** and project-file drops validate and decode the incoming project before replacing state.

Imported asset IDs are remapped, so another project cannot accidentally reuse a cached image under the same ID. Changes made while a slow import is preparing are protected. Credentials and endpoint settings are excluded from project files. Autosave is origin-specific: portable backups are the reliable way to move between origins or browsers.

## Models and provider transport

The app uses the dedicated OpenRouter Image API:

- Discovery: `/api/v1/images/models`
- Generation: `/api/v1/images`

`src/lib/models/catalog.json` records the dated capability snapshot. The app refreshes capabilities from OpenRouter at runtime and keeps the snapshot as an explicit offline fallback. All nine requested canonical model IDs are present in the catalog. Nano Banana 2.1 is the default:

```text
google/gemini-3.1-flash-lite-image
google/gemini-3.1-flash-image
google/gemini-nano-banana-2.1
openai/gpt-image-2.5-sunburst
black-forest-labs/flux-3-image
x-ai/grok-imagine-image-2.0
bytedance-seed/seedream-5-0-flash
bytedance-seed/seedream-5-0-lite
bytedance-seed/seedream-5-0-pro
```

The two original shorthand IDs are accepted as aliases. The general chat catalog is not used to decide image-model availability. Account access, credits, prices and actual rendering quality remain provider/account properties, not guarantees made by a dropdown.

Before a request is sent, it is checked against the model’s capabilities and rebuilt from its allowlisted fields; input images are always embedded PNG, JPEG or WebP, never remote URLs. Up to 32 requests run at once. A host has to speak HTTP/2 to carry them all at the same time – browsers open at most six HTTP/1.1 connections per host and queue the rest, their 240-second timeout included. OpenRouter does, and so does an HTTPS `?openrouter_host` or `?ai_endpoint` behind a current reverse proxy.

### OpenRouter host and key

`?openrouter_host=openrouter.nas.lan` sends every OpenRouter request – discovery and generation – to another origin serving OpenRouter’s API under `/api/v1/`, like an OpenRouter proxy. A bare host means HTTPS; a full URL like `http://10.0.0.22:3310` keeps its scheme and port, and any path is dropped. Anything that is not HTTP(S) falls back to `https://openrouter.ai`. Requests go straight from the browser, which requires CORS on that host, and authenticate with the browser-session key.

`?openrouter_key=sk-or-v1-…` starts the tab with that browser-session key, exactly as if it had been entered in the key popover. `?openrouter_key=false` (or `0`) sends every request without an `Authorization` header and locks the key input, for a host that adds its own key, like `?openrouter_host=openrouter.nas.lan&openrouter_key=false`.

### Own endpoint (CLIProxyAPI)

`?ai_endpoint=http://127.0.0.1:8317/v1` sends generations straight from the browser to an OpenAI-compatible endpoint like [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI), through the AI SDK’s `generateImage`, instead of OpenRouter. A bare origin gets `/v1` appended. No OpenRouter key is required; a browser-session key, if entered, is sent as bearer token. The endpoint must allow CORS. From an HTTPS page, a plain-HTTP endpoint works when it is a private IP literal like `127.0.0.1` or a `.local` host, which Chrome exempts from mixed-content blocking once local network access is allowed; plain-HTTP hostnames are blocked.

The model ID is sent without its vendor prefix. Gemini models use `/chat/completions` with `image_config`; all others use `/images/generations`, or `/images/edits` once input images are attached. With CLIProxyAPI, this covers `google/gemini-3.1-flash-image`, `openai/gpt-image-2.5-sunburst` and `x-ai/grok-imagine-image-2.0`; the other catalog models are not served there. Models outside the catalog, like `gpt-image-2.6-sunburst` or `muse-image-1.0`, are added with `model_id`.

`model_id` adds any model ID to the picker. It can be repeated, like `?model_id=grok-imagine-image-2.0&model_id=gpt-image-2.5-sunburst`; the first one is selected unless the saved selection is one of them. For example `?ai_endpoint=http://127.0.0.1:8317&model_id=gpt-image-2.5-sunburst&ratios=1,3/4,4/3,16/9,9/16`. The ID is sent exactly as given. If it matches a catalog model, with or without vendor prefix, that model’s resolutions, qualities and reference limit apply; otherwise there are none and up to 16 references are allowed. Controls from the model traits below take precedence.

`models` limits the picker to a comma-separated list of model IDs, in that order, like `?ai_endpoint=https://cliproxy.nas.lan&models=gpt-image-2.6-sunburst,gemini-3.1-flash-image,grok-imagine-image-2.0,muse-image-1.0`. IDs matching a catalog model, with or without vendor prefix, use that model; all others are added like `model_id`, so `ratios` applies to each of them. `model_id` models stay available ahead of the list. The first listed model is selected unless the saved selection or `model` is one of them. `ratios` sets its frame ratios as a comma-separated list of `16/9`, `16:9` or a bare `1` for 1:1; without it, the ratios verified for the endpoint, the matching catalog model’s ratios or 1:1, 3:4, 4:3, 9:16 and 16:9 are used.

`src/lib/models/modelTraits.ts` describes models matching its minimatch patterns, with or without vendor prefix. Every matching entry applies, and for each field the earliest entry that sets it wins, so a specific model like `{,*/}gpt-image-2.6-sunburst` comes before its family `{,*/}gpt-image-*`. `vendor`, `title` and `icon` always apply: they name the maker the picker groups a model under, its display name and its [Lobe Icons](https://github.com/lobehub/lobe-icons) logo, which monochrome logos draw in the text color. The picker is a customizable select, so the logos also appear in its options. The remaining fields only apply while `ai_endpoint` is set. Its `ratios` replace the catalog ratios with the ratios the endpoint actually honors: through CLIProxyAPI, Grok Imagine 2.0 answers 9:19.5, 19.5:9, 1:2 and 2:1 with a square, so those are left out. Its `controls` replace the catalog resolutions and qualities offered in the picker. Its `hook` receives every outgoing request body together with the current control values (aspect ratio, resolution and quality) and returns the body that is actually sent. The traits cover:

| Model | Resolution | Quality | Hook |
| --- | --- | --- | --- |
| `gemini-3.1-flash-image` | catalog (512–4K) | `minimal`, `high` | quality becomes `reasoning_effort`, which CLIProxyAPI turns into the thinking level |
| `gpt-image-2.6-sunburst` | 1K, 2K, 4K | `auto` … `max` | ratio and resolution become a `size` like `2736x1536` within OpenAI’s limits (multiples of 16, at most 3840 px per edge, 655,360–8,294,400 px), replacing `aspect_ratio` and `resolution` |
| `grok-imagine-image-2.0` | 1K, 2K | `auto`, `low`, `medium` | none |
| `muse-image-1.0` | none (fixed 2.56 MP) | `low`, `high` | ratio becomes a `size` like `1820x1024`, quality becomes `reasoning_strength`; ratios from 1:16 to 16:1 |

## Keyboard controls

| Action | Shortcut |
| --- | --- |
| Generate | Ctrl+Enter / Cmd+Enter |
| Undo / redo | Ctrl+Z / Ctrl+Shift+Z; Cmd equivalents |
| Frame / Image / Mask tool | V / I / M |
| Show frame (or generation area while the frame is off) / all artwork | F / Shift+F |
| Pan | Space+drag or middle-button drag |
| Zoom | Wheel; + / − |
| Pan with wheel | Shift+wheel, or horizontal trackpad scrolling |
| Nudge active frame, image or mask | Arrow keys; Shift for larger steps |
| Disable magnetic snapping | Hold Shift during a frame/image move |
| Delete selection | Delete / Backspace outside text fields |
| Exit mask mode | Escape |
| Context-menu keyboard navigation | Arrow keys, Home, End, Escape |
| Collection details: previous / next item, frame view `![0]`, last item | ← / → (wrapping around), ↑, ↓ |

## Verification

```powershell
bun run lint
bun run test
bun run build
bun run test-browser
bun run test-browser --development
```

`bun run check` runs type checking, unit/component tests, the production build and the production browser suite. Set `CHROME_PATH` when Chrome is not in a standard location. Tests use a temporary browser profile; they do not access your normal Chrome profile.

Browser checks include real PNG/SVG/JXL imports without experimental JXL browser flags, zero-delay Monaco typing, frame ratio snapping, imported-image transforms, cancellation, request capture, generated-layer locking, mask pixel invariants, native-detail raster exports, PNG clipboard write/read, portable projects, autosave recovery and responsive dark/light layouts.

Provider responses in the repeatable browser suite are deterministic mocks. Running the suite does not spend OpenRouter credits. A real, paid generation smoke test is intentionally separate and requires your configured account.

Test logs and screenshots are written under `out/test/`.

## Boundaries

This is an 8-bit browser-raster workflow, not an archival HDR or full color-management pipeline. Accepted PNG/JPEG/WebP source bytes are retained; other supported imports are normalized to WebP. JPEG XL uses a local, lazy WebAssembly worker. Image-size and export-size limits protect the browser; large documents and undo history still require substantial memory.

Image models can recompose or shift a subject. **Content-aware alignment** in a generated layer’s controls registers its output onto the canvas it was generated from. It is off by default because geometric registration can misinterpret legitimate edits, and it only moves content when it finds a reliable match. The first activation analyzes the images in a background worker; the result is stored with the layer, so later toggles are instant and survive reloads and portable projects. The layer’s world rectangle and the raw provider output never change; realigned content is clipped to the captured frame.

Color adjustments are non-destructive. They are rendered with a WebGL 2 shader (with an identical CPU fallback) and apply to the viewport, generation inputs, snapshots and exports alike. Cancellation prevents a late layer from being added, but a provider may still bill work already performed.

The Monacozen module-worker packaging fix is retained as a version-specific Bun patch. Remove it only after an upstream replacement passes both production and development browser tests.
