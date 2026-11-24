# Stuora media provenance

`berlin-skyline.jpg` is decorative city artwork, never a listing photo.
Photo: Tom Kühnel, Berlin skyline / television tower at sunset.
Source: https://unsplash.com/photos/berlins-skyline-includes-the-tv-tower-at-sunset-Io0Rk4E852g
Image: https://images.unsplash.com/photo-1743348717569-ccd2c1d09d6e
License verified 2026-10-11: https://unsplash.com/license
Downloaded at 1600px, JPEG quality 80. No third-party image request occurs at runtime.
Listing media must come from user uploads and is not implemented in this UI slice.
The ribbon logo and icons in src/ui/Brand.tsx are repo-native SVG artwork inspired
by the approved Stuora design reference, rendered on web/iOS/Android.


## Canonical Stuora identity

Use `assets/stuora-mark.svg` as the versioned vector source for future favicon/app-icon/splash raster exports; it mirrors the original `src/ui/Brand.tsx` mark. The `supabase/auth-branding/` pack uses brand typography and color without externally hosted email images. See `docs/STUORA_BRAND_SYSTEM.md` for current live-vs-source verification status.
