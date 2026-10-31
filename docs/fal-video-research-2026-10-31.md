# Fal video API research (2026-10-31)

## Seedance 2.5 reference-to-video
Official OpenAPI schema: https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=bytedance/seedance-2.5/reference-to-video
Official model page: https://fal.ai/models/bytedance/seedance-2.5/reference-to-video

Verified input schema: `prompt`; `image_urls` array (up to 30 images; formats include JPG, PNG, WebP; each max 30 MB); `duration` string enum `4` through `30` or `auto`; `resolution` `480p`, `720p`, `1080p`; `aspect_ratio` includes `9:16`, `16:9`, `1:1`; `generate_audio` boolean defaults true, and documentation says audio includes sound effects, ambient sounds and lip-synced speech. Output contains `video.url`. Thus one Fal request can produce one native-audio clip up to 30 seconds with the product cover as a visual reference; no separate clip assembly is technically required for requested 20-30 sec. Keep no user-supplied unsupported override. End-user ID schema is nullable/optional in retrieved schema.

## Fal video merge endpoint
Official OpenAPI schema: https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/ffmpeg-api/merge-videos
Input is `video_urls` (minimum two, ordered list), optional target_fps and resolution. Output is `video.url`. It merges clips but does not generate audio/dialogue. This would only be needed if segment generation is chosen.

## Existing project state at research
Repository `marioce12-bot/Chariow`, `main` HEAD observed as `6bad835`. Existing code includes `lib/studio/video-plan.ts` with product-aware creative directions and 5/10/15/30/45/60 duration splitting under a verified max-duration=15 Grok model. The generation API `app/api/studio/video/route.ts` is explicitly locked and returns HTTP 423. UI has prompt generation and a video route placeholder. Video job status/content routes assume a Fal queue job and studio_generations row. `lib/studio/credits.ts` has credit rate video 480p=15,720p=25,1080p=38 per second, with `videoCreditCost`. Durable background workflow exists for image/slideshow tasks, but video generation was deliberately excluded pending reviewed worker/assembly/credit lifecycle. Fal client module `lib/ai/fal.ts` uses `fal.queue.submit`, `fal.queue.status/result` and `FAL_API_KEY`.

No Fal generation has been run; docs were checked only. No credentials or paid requests used.
