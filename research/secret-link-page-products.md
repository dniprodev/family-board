# Research: secret-link page products

**Research date:** 2026-08-21  
**Scope:** Hosted products first; self-hosting as a fallback. Sources are official product documentation, official help centers, official APIs, or first-party service pages only. Product fit was also checked manually where the documentation was ambiguous.

## Confirmed product definition

The target is one mobile-first page containing a list of links. One person edits it; other people read it.

- No accounts or passwords for editor or readers.
- One unguessable shared read URL.
- A separate unguessable edit URL; possession of it grants editing.
- Plaintext storage is acceptable.
- The page should be unlisted/not intentionally exposed to crawlers or search engines.
- MVP operations: add a link, edit its title, reorder it, and immediately delete it.
- Autosave; online-only.
- The editor should work very well on a phone and ideally be installable as a PWA.
- Readers use a desktop browser for now.
- Hosted service is preferred; self-hosting is an acceptable fallback.
- Future direction: sections, previews, and expandable board widgets.

This is bearer-link privacy, not identity-based authorization: anyone who obtains the read link can read, and anyone who obtains the edit link can edit. `robots.txt` and `noindex` reduce discovery but do not protect a URL that has been obtained.

## Executive recommendation

### No viable hosted match found

The two apparently closest hosted candidates fail the requirements in hands-on use:

- **AnonPaste** still requires authentication to edit; possession of the link alone is not sufficient.
- **Anonynote** uses a notepad name as the access key, so anyone who guesses the name can open and edit it. Its interface is also note-centric rather than a list of link cards with a separate title and URL.

The official Anonynote page confirms the underlying problem: the notepad name is the only protection, anyone who knows it can read and edit, and the product is explicitly not designed for sensitive information ([official description](https://anonynote.org/about)).

The product search should therefore be considered complete: no reviewed hosted product satisfies the combination of passwordless bearer-link access, separate read/edit links, a structured title-plus-URL card model, and a genuinely convenient mobile editor/PWA.

### Self-hosting fallback: HedgeDoc

[HedgeDoc's URL scheme](https://docs.hedgedoc.org/references/url-scheme/) gives an editor URL and a separate published, read-only URL. Its [permission matrix](https://docs.hedgedoc.org/references/permissions/) documents a `Freely` mode where guests can read and write. Its [YAML metadata](https://docs.hedgedoc.org/references/yaml-metadata/) supports `robots: noindex, nofollow` on the published note. The official project documents [Docker](https://docs.hedgedoc.org/setup/docker/) and manual installation, so it is a realistic self-hosting fallback.

The hard compromises are important: this is a collaborative Markdown pad, not a link-list product; the guest-write permission is configured at the note level rather than being a dedicated secret edit token; and an operator must configure anonymous access and permissions correctly. The official docs do not document a hosted commercial offering with the same control, so hosted use generally means choosing a third-party instance or running it yourself.

### Build the product if the structured mobile UX is non-negotiable

The research did not find a hosted product that documents all of the following together: anonymous bearer-link creation, separate read/edit credentials, per-item link/title/reorder/delete operations, autosave, a current installable PWA, and explicit no-index behavior. The missing part is not storage or link sharing; it is the small, focused editor experience. A custom service can retain the simple model while making the edit token a first-class URL and the page a crawler-readable read-only HTML view only when desired.

## Candidate comparison

| Product | Officially verified strengths | Hard mismatches or unverified requirements | Hosting / cost evidence | Overall fit |
|---|---|---|---|---|
| **AnonPaste** | No-account creation and private sharing are documented. | Manual check found that editing still requires authentication; it also lacks the desired structured link-card UX and PWA. | Hosted; [free plan is $0/month](https://anonpaste.com/pricing). | **Rejected** |
| **HedgeDoc** | Separate editor and published read-only URLs; guest read/write mode; `noindex, nofollow` metadata; Markdown; official Docker/manual deployment. | Collaborative pad rather than structured link list; anonymous mode is instance configuration; no dedicated edit-token semantics; hosted offering not established in official docs; PWA not established. | Open-source/self-hosted via [Docker](https://docs.hedgedoc.org/setup/docker/) or manual setup. | **Best self-host fallback** |
| **CryptPad** | Link sharing has separate View and Edit rights; unregistered users can collaborate through shared links; client-side encryption means the server cannot read document content; mobile use is supported and PWA work is documented. | Heavy office suite; no dedicated link-list CRUD; PWA is described as work in progress, not a confirmed current installable app; link keys in fragments are a different security model; owner/access controls can require accounts. | Hosted flagship plus many instances; free software can be [installed by anyone](https://docs.cryptpad.org/en/admin_guide/installation.html). | Good security/permission reference, poor MVP UX match |
| **Rentry** | Random URL is generated when no slug is supplied; separate edit code can edit/delete/rename; optional modify code can be shared to edit text; Markdown supports links; free and hosted. | Edit code is not documented as a separate edit URL; no structured link-item operations or autosave; official `robots.txt` disallows edit/raw endpoints but does not disallow page URLs, so it is not a verified no-index match; no PWA evidence. | Hosted and free according to [Rentry's product page](https://rentry.org/what); no official self-hosting offering found. | Excellent simple paste approximation, but crawler/privacy mismatch |
| **Write.as** | Anonymous posts use a unique URL/token; no account is needed; editor autosaves locally; mobile apps exist; posts are not publicized by default. The official site points to self-hostable WriteFreely. | Anonymous edit/delete credentials are kept on the original device; accessing the post list across devices requires an account; no separate edit URL for sharing; it is a writing/publishing tool, not a link-item editor. Official `robots.txt` allows general paths and blocks selected named bots, not a general no-index guarantee. | Hosted Write.as; [Pro pricing is published](https://write.as/about); self-host fallback is WriteFreely as described on the [official features page](https://write.as/features). | Strong mobile writing UX, wrong permission handoff |
| **Etherpad** | Anonymous author sessions are supported; official API exposes a distinct read-only ID; self-hostable Docker deployment; PWA install metadata is present in the documented configuration. | A pad is a real-time text editor, not a private bearer edit token or structured link list; the official API assumes an external application may provide authentication; no hosted service or per-pad no-index behavior established. | Open source/self-hosted; [official Docker docs](https://docs.etherpad.org/docker.html). | Technical building block, not a product fit |
| **PrivateBin** | Anonymous creation; secret URL; client-side encryption; self-hosting; plaintext is not exposed to the server. | It is intentionally paste-like and immutable: official FAQ documents deletion, not post-creation editing; no separate read/edit URL; no list-item model, autosave, or PWA. | Open-source/self-hosted; [official project site](https://privatebin.info/). | Wrong lifecycle despite strong secrecy |
| **Google Docs** | Hosted document; link sharing has Viewer/Commenter/Editor roles; official help documents anonymous or unsigned-in people appearing in shared files; mobile apps exist. | One link carries the selected role rather than separate read/edit bearer links; owner needs a Google account; no secret-link-specific no-index guarantee; full document UI is too heavy for the intended list. | Hosted Google service; no self-hosting. See [official access levels](https://support.google.com/docs/answer/16722399) and [anonymous/unknown users](https://support.google.com/docs/answer/2494888). | Familiar but fails the no-account/editor-link model |
| **Notion** | Hosted wiki/document pages; a page can be shared to the web with view/edit access; rich pages and future sections are strong. | Official help explicitly says visitors need to be logged in to Notion to comment or edit; no anonymous edit bearer link; public web publishing is not the desired crawler posture. | Hosted; no self-hosting. See [official sharing help](https://www.notion.com/en-gb/help/share-your-work). | Hard mismatch |
| **Raindrop.io** | Purpose-built bookmark/list model; members can add/edit/delete; public pages can be read-only. | Official collaboration help requires every shared-collection member to sign up for a free account; public pages are read-only; no anonymous edit link or separate bearer edit URL. | Hosted; free collaboration for members, but account required. See [official collaboration help](https://help.raindrop.io/collaboration). | Best domain model, fails access model |
| **Linkwarden** | Purpose-built collaborative bookmark manager; links have name/description and can be edited/deleted; public collections; cloud instance plus open-source self-hosting. | Official docs center the product around user accounts; collaboration is not documented as anonymous bearer-link editing; no separate secret read/edit URLs or PWA evidence. | [Official docs](https://docs.linkwarden.app/) identify it as self-hosted and document an official cloud instance; browser setup requires account credentials in the [official extension guide](https://docs.linkwarden.app/getting-started/browser-extension). | Strong future-board reference, not an MVP fit |

## Detailed findings

### 1. AnonPaste — rejected after manual check

AnonPaste looked promising from its documentation because it describes account-free creation, private sharing, and manage links. However, manual use found that editing still requires authentication; possession of the link alone is not sufficient. It also presents a paste/block editor rather than the required list of link cards, each with a distinct title and URL. It is not a viable match.

### 2. HedgeDoc

HedgeDoc has the cleanest documented URL separation: a long random editor URL and a short random published read-only URL. The note permission `Freely` allows both guest read and guest write, so a self-hosted instance can be configured around the bearer-link model. The published version can carry `robots: noindex, nofollow` in YAML frontmatter.

The mismatch is conceptual and operational. The long editor URL itself is the access credential, and anyone with it can edit; this is close to the requirement but not a first-class “edit token” feature. The system is a collaborative Markdown note, so add/edit/reorder/delete would mean editing Markdown rather than manipulating link records. Anonymous access, note creation, and default permissions must be set by the instance operator. This is a credible fallback if control and self-hosting matter more than polish.

### 3. CryptPad

CryptPad's official docs verify View and Edit link permissions and explain that unregistered users can use shared links to edit and view files. Its end-to-end encryption means document content is encrypted before storage, and its URL design keeps the encryption seed after `#`, which browsers do not send to the server. This is stronger than the requested plaintext-storage model and can reduce what a crawler/server can learn.

However, CryptPad is a full collaborative office suite. The documentation says mobile browsers are supported and that PWA work is underway, but it does not establish a current PWA installation experience. It also does not provide a dedicated link-list editor or a simple edit-link rotation model. Treat it as a useful security/permission reference, not the likely product to adopt for this MVP.

### 4. Rentry

Rentry is the simplest close analogue to the original idea: random public page URL, optional edit code, optional modify code, Markdown links, no account requirement stated in the official product documentation, and permanent pages. The modify code is particularly close to sharing read access separately from the ability to change content, although it is a code rather than a separate edit URL.

The crawler requirement is the decisive problem. Rentry's official `robots.txt` disallows `/edit`, `/raw`, `/source`, and export-like paths, but does not disallow ordinary page URLs. That is not evidence of `noindex`; it suggests normal pages remain crawlable if discovered. Rentry also has no documented structured list editor, autosave, or PWA.

### 5. Write.as and Telegraph

Write.as is a good example of a polished anonymous writing flow: a unique post URL/token, local autosave, mobile apps, and no-signup publishing. The official security guide says anonymous post IDs are kept on the device and that an account is the convenience path for accessing the list from another device. That is precisely why it fails the requested handoff: the editor cannot simply give another device a separate edit URL without moving into account/device-local behavior. Its anonymous page link is a read/share link, not a documented editor bearer link.

Telegraph has a minimalist mobile-friendly publishing UI and a public article URL, and its official API supports account-scoped editing through access tokens. The public web editor's edit state is not documented by the official API as a transferable separate edit URL; the API itself requires an access token for page creation/editing. It is therefore not a reliable fit for this no-account, cross-device editor flow.

### 6. Bookmark/list products

Raindrop.io and Linkwarden prove that the future board/list information architecture is common: link records have names/descriptions, collections, and editing/deletion operations. Their access models are the problem. Raindrop explicitly requires collaborators to sign up, while Linkwarden's official workflows are account-based and its public sharing is described as public collections rather than anonymous editing. These products are useful UX references for future sections/previews, but not viable MVP backends under the confirmed no-account constraint.

## Requirements matrix

Legend: **Yes** = explicitly documented; **Partial** = close or configuration-dependent; **No** = explicit mismatch; **Unverified** = not established in the official sources reviewed.

| Requirement | AnonPaste | HedgeDoc | CryptPad | Rentry | Write.as | Linkwarden |
|---|---:|---:|---:|---:|---:|---:|
| Hosted option | Yes | Partial | Yes | Yes | Yes | Yes |
| Self-host fallback | Unverified | Yes | Yes | Unverified | Yes, via WriteFreely | Yes |
| Reader without account | Yes | Partial/configured | Partial/configured | Yes | Yes | Public read only |
| Editor without account | No, manual check requires authentication | Partial/configured | Partial/configured | Yes via edit code | Same-device anonymous flow | No evidence |
| Separate read/edit credential | Yes: share/manage links | Yes: published/editor URLs | Yes: View/Edit links | Partial: page/edit code | No | No evidence |
| Hidden from search engines | Yes for private unencrypted mode | Yes if note uses `noindex, nofollow` | Content is encrypted; no explicit noindex result verified | No evidence; robots does not block pages | No general noindex guarantee verified | No evidence |
| Structured link-item CRUD | Partial via blocks | No; Markdown note | No; document app | No; Markdown | No; prose editor | Yes, but account-based |
| Autosave | Unverified | Realtime updates, not mobile autosave | Realtime collaboration | Unverified | Yes, local draft autosave | Unverified |
| Mobile editor | Yes | Unverified | Yes | Unverified | Yes | Unverified |
| Current PWA documented | Unverified | Unverified | Planned/in progress | Unverified | Mobile apps, not PWA | Unverified |

## Final recommendation

1. **Build the product.** The missing requirement is not generic text storage; it is the focused card editor: `LinkItem { title, url, position }`, separate read/edit bearer URLs, mobile PWA editing, and autosave.
2. **Use HedgeDoc only as a self-hosting/reference prototype.** It supplies the strongest documented editor/read URL split and crawler metadata, but its Markdown editor would need to be replaced or wrapped to obtain the desired UX.
3. **Keep the first implementation small:** `Page`, `LinkItem { url, title, position }`, `readToken`, and `editToken`; server-render the read page with `noindex, nofollow`; store the edit token locally in the PWA; debounce autosave; support edit-token rotation.

## Sources

All sources below are first-party product documentation or official service pages used above.

- [AnonPaste anonymous use](https://help.anonpaste.com/accounts/anonymous-use/)
- [AnonPaste paste settings](https://help.anonpaste.com/pastes/creating-paste/paste-settings/)
- [AnonPaste editing](https://help.anonpaste.com/pastes/editing/)
- [AnonPaste text paste / mobile](https://help.anonpaste.com/pastes/creating-paste/text-paste/)
- [AnonPaste content blocks](https://help.anonpaste.com/pastes/content-blocks/)
- [AnonPaste Lite pastes](https://help.anonpaste.com/pastes/lite-pastes/)
- [AnonPaste pricing](https://anonpaste.com/pricing)
- [HedgeDoc permissions](https://docs.hedgedoc.org/references/permissions/)
- [HedgeDoc URL scheme](https://docs.hedgedoc.org/references/url-scheme/)
- [HedgeDoc YAML metadata](https://docs.hedgedoc.org/references/yaml-metadata/)
- [HedgeDoc configuration](https://docs.hedgedoc.org/configuration/)
- [HedgeDoc Docker installation](https://docs.hedgedoc.org/setup/docker/)
- [CryptPad share/access](https://docs.cryptpad.org/en/user_guide/share_and_access.html)
- [CryptPad mobile/PWA FAQ](https://docs.cryptpad.org/en/FAQ.html)
- [CryptPad installation](https://docs.cryptpad.org/en/admin_guide/installation.html)
- [CryptPad database and URL encryption model](https://docs.cryptpad.org/en/dev_guide/database.html)
- [CryptPad security](https://docs.cryptpad.org/en/user_guide/security.html)
- [Rentry product guide](https://rentry.org/what)
- [Rentry robots.txt](https://rentry.org/robots.txt)
- [Write.as security guide](https://guides.write.as/security/)
- [Write.as apps](https://write.as/apps)
- [Write.as features / WriteFreely self-hosting](https://write.as/features)
- [Write.as robots.txt](https://write.as/robots.txt)
- [Etherpad HTTP API](https://docs.etherpad.org/api/http_api.html)
- [Etherpad Docker](https://docs.etherpad.org/docker.html)
- [PrivateBin official site](https://privatebin.info/)
- [PrivateBin FAQ](https://github.com/PrivateBin/PrivateBin/wiki/FAQ)
- [Google Drive sharing](https://support.google.com/drive/answer/2494822?co=GENIE.Platform%3DDesktop)
- [Google Docs access levels](https://support.google.com/docs/answer/16722399)
- [Google anonymous/unknown users](https://support.google.com/docs/answer/2494888)
- [Notion sharing](https://www.notion.com/en-gb/help/share-your-work)
- [Raindrop collaboration](https://help.raindrop.io/collaboration)
- [Linkwarden documentation](https://docs.linkwarden.app/)
- [Linkwarden links](https://docs.linkwarden.app/Usage/links)
- [Linkwarden browser extension](https://docs.linkwarden.app/getting-started/browser-extension)
- [Telegraph API](https://telegra.ph/api)
