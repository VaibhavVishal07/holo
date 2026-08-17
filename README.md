# HOLO

Turn any black-and-white graphic into a holographic sticker.

Upload a logo, wordmark, icon or doodle and it comes back as premium silver
holographic vinyl — die-cut, tiltable, and exportable at the exact angle where
the light looks right. Everything happens in the browser; the image never leaves
the device.

```
npm install
npm run dev
```

## The material

The sticker is a custom GLSL film, not a gradient. Two things carry it.

**Silver comes from reflecting a room.** `room()` builds a small procedural
studio — a bright ceiling over a dark floor, a key softbox, a fill strip, a dark
occluder — and the surface samples it through its reflection vector, magnified so
that a two-degree tilt moves the sample four degrees. That swing is what makes
the surface read as metal. A flat grey fill never will, however good the spectrum
on top of it is.

**Colour comes from the grating equation.** For a grating of pitch `p`, the
wavelength that reflects toward the eye at half-angle sine `x` is `λ = p·x/m`.
The shader resolves the half-vector in the tangent frame of the *perturbed*
surface, so rotating the sticker changes which wavelength arrives because the
geometry changed — the reflection is not an animation running alongside the
object. Away from the angles where a visible wavelength happens to land, the
surface keeps reflecting the room, which is why most of it stays chrome.

Several decisions in there exist because the obvious version looked wrong:

- **First order dominates.** Giving higher orders real weight superimposes red on
  violet, which resolves to magenta — a colour no single grating can produce, and
  the shortest route to a Web3 oil slick.
- **The visible window stays inside the spectral fit's 400–700nm domain.** Reach
  past either end and there is a band where the diffraction has energy but the
  fit returns near-black, which paints a grey halo around every hotspot.
- **Hue is normalised, intensity is not.** Summed orders otherwise average toward
  white and the whole film goes pastel. A small white pedestal stays, because
  real foil is never a pure spectral primary.
- **The agreement term is squared and then heavily overdriven.** A gentler factor
  spreads a thin wash of colour over the entire sticker; the mean is the same but
  a uniformly tinted sticker is not what foil looks like. Concentration is the
  point.
- **Where the film can diffract is anisotropic; the pitch is not.** Elongating
  the coverage field along the grooves gives colour its drawn-out shapes.
  Elongating the pitch field too makes the spectrum sweep inside a single patch,
  and the result reads as airbrushed rainbow strokes.
- **Two normals.** The grating follows the vinyl's real shape; grain and brushing
  are finer than the grating and only scatter the specular.

Roughly 15–20% of the surface carries colour at a typical angle, with a mean
brightness around 200/255 — silver first, hotspots second.

## The die cut

Masking runs once per upload, never during interaction. The alpha channel wins
when the file has one; otherwise luminance is thresholded with Otsu's method
through a soft window, with the paper side inferred from the border pixels so
white-on-black artwork works without touching Invert.

The mask then becomes a signed distance field (Felzenszwalb & Huttenlocher). That
is what makes the border a free shader uniform: dilating a distance field follows
the real contour, survives concave forms and typographic counters, and stays
smooth at 4× export. Two details matter — within ~1.5px of the contour the
integer transform is replaced by `(0.5 − α)/|∇α|`, which reads the sub-pixel
position of the iso-line straight out of the anti-aliasing; and the finished
field gets a one-pixel blur, because an exact discrete transform has faintly
polygonal iso-contours a few pixels out and the border reads them back as a
stepped edge.

## The feel

Rotation is never bound to the pointer. Input moves a target and a spring chases
it, so the surface arrives a beat late and settles. The virtual light rides a
separate mapping with its own slower spring, offset so the highlight is never
parked under the cursor. Releasing a drag leaves a little momentum; left alone,
the object drifts rather than snapping back to a dead zero.

None of this touches React. Pointer handlers write to a plain object and the
render loop reads it, so a frame costs a few uniform writes.

## Export

**Still** renders at the live orientation into an offscreen target, framed by
projecting the tilted silhouette's corners and handing the rectangle to
`camera.setViewOffset` — full resolution on the sticker, none spent on empty
canvas. 1× is 1024px on the long edge, up to 4096. Transparent PNGs drop the
shadow and the scene background, and the readback un-premultiplies (skipping that
divide is what gives exported stickers a dark halo along every edge).

**Motion** records three seconds off the live canvas via `MediaRecorder`, cropped
tight through a per-frame blit taken after the render. Each preset is built from
whole cycles of one period so the clip loops, and the closing pose is held briefly
because the encoder does not reliably receive the last few frames before a stop —
those missing frames are the seam.

## Layout

```
src/
  components/   Stage, Dock, MaterialRail, Slider, ExportPanel
  hooks/        useTilt, useExport, useMotionExport
  lib/          artwork (decode + mask), edt (distance field), demoArtwork
  materials/    presets
  scene/        Sticker, Backdrop, materials, handle
  shaders/      holographic, edge, shadow, silhouette
  state/        store
```

## Notes

- Satoshi is served from `public/fonts/` as a variable font.
- The seven presets differ in base metal, studio, grating pitch, pitch variance,
  domain orientation spread, coverage, specular roughness and anisotropy, facet
  strength and spectral bias — not just in colour.
- Switching material interpolates every parameter rather than cutting.
- `prefers-reduced-motion` disables the idle drift and the Auto oscillation;
  direct manipulation still responds.
- Optional device-orientation tilt on phones (spec item 74) is not implemented;
  touch drag covers rotation.
