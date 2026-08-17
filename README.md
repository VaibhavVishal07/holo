# HOLO

Turn any black-and-white graphic into a holographic sticker.

Upload a logo, wordmark, icon or doodle and it comes back as premium silver
holographic vinyl — die-cut, tiltable, and exportable at the exact angle where
the light looks right. Everything happens in the browser; the image never leaves
the device.

It opens on a dark canvas, because the material is a reflective object and reads
best against a room darker than itself.

```
npm install
npm run dev
```

## Shapes

Six ship with the tool: Sparkle, Star, Bolt, Heart, Ring, Bloom. Each is a single
SVG path string, which is the whole point — the same string draws the swatch in the
panel and, through `Path2D`, rasterises the mask the material is cut from. A swatch
can never disagree with the sticker it produces.

The set exercises the pipeline rather than filling a clipart tray: fine points, hard
corners, deep concavity, a true hole, and smooth curves.

## The object

The sticker is a real extruded solid. Its die-cut outline is traced out of the
distance field with marching squares and extruded with a shallow bevel, so it has
side walls that catch the light and a silhouette with genuine thickness when it
turns. Depth is baked at one unit and applied by scaling z, so the Depth control
never triggers a geometry rebuild — only a change of border width needs a new
trace. Holes nest correctly: each one is assigned to the smallest shell that
contains it, so a counter inside a letter inside a badge resolves.

Because the mesh now *is* the silhouette, the shader stopped trimming the front
face. It reads the field only to decide which material a point is — exposed foil
or the white overprint around it — so that inner boundary stays analytic and
perfectly crisp while the outer edge comes from real geometry.

## The material

The sticker is a custom GLSL film, not a gradient. Several layers carry it.

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

**The film is coherent.** On real rainbow foil the spectrum sweeps across the
whole piece in broad continuous bands — pink into peach into mint into lilac —
and slides into mirror silver where the angle stops diffracting. It does not
break into patches with edges. So every field feeding the wavelength is
deliberately low frequency and domain-warped: plain low-frequency noise has
iso-contours that run close to straight across one cell, which came out as
parallel stripes, and warping the lookup makes the bands curl and wrap the way
they do on film. Anything finer than this — a third octave, a quantised
orientation, micro-roughness reaching the wavelength — makes colour jump between
neighbouring pixels as the object turns, which reads as a broken effect rather
than a material.

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
- **Pitch varies widely.** That swing is what pushes whole regions of the sheet
  outside the visible band, and those regions are the chrome between the sweeps.
  Without it the whole sticker carries colour at once.
- **Pearl is a separate control from saturation.** Soft pastel stationery foil
  carries a lot of white under the spectrum; saturated rainbow chrome carries
  almost none. It is the knob that calibrates a preset against real film.
- **Two normals.** The grating follows the vinyl's real shape; grain and brushing
  are finer than the grating and only scatter the specular.

**One film, not a picker.** The parameters that give the material its character —
grating pitch and its variation, band count, orientation drift, pearl, saturation,
the studio it reflects — are fixed in `materials/film.ts`. What is left on the panel
is what actually changes the look of a sticker. A style list was tried and removed:
nine of them mostly varied hue bias, which is a decision the tool can just make.

**Glass, and why the highlights are a separate layer.** A laminate sits over the
foil with its own normal and its own Fresnel, and `dispersion` separates the
channels through it — widest where the surface turns away, which is what fringes a
bevel with colour. The studio's specular sources are deliberately kept out of its
body: two narrow strip lights and three four-spike glints, reflected off the coat
and added *after* the diffraction. Folding them into the body meant the strongest
colour multiplied them away, which is backwards — a reflection off the top of the
laminate happens before the light ever reaches the film, so no amount of colour
underneath should dim it. It is also why there is no tight specular lobe here: on a
sheet this flat with the light this far off axis, no point lobe ever aligns, but a
reflected strip always finds some part of the surface.

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

## The interface

A dark studio with one instrument in it. The canvas is the room; the dock is a
piece of equipment sitting in it. Three rows: the shape rail, a tab bar, and the
active group. The rail stays out because it is the fastest way to get something on
the canvas; everything else is grouped by what it acts on and shown one group at a
time, which is what keeps the panel from reading as a form. The body holds a fixed
height so switching groups never makes the panel jump under the pointer.

Nothing is a card, nothing floats, and the only accent is white, because the
sticker supplies the colour.

Sliders draw their own track, fill and knob so they can carry a visible value and
a real hit area, with the native input over the top at zero opacity — keyboard
stepping and assistive behaviour stay native rather than reimplemented.

**The light.** Two sliders would technically place a light, but a light has a
position and the control for a position is a position, so it is an XY pad. The dot
is also a live readout: while the light is tracking the pointer you can watch it
travel and see what the material is responding to. That readout runs off the render
loop and writes to the DOM, never to React — a light that moves every frame must
not cost a render every frame. Placing the light by hand pins it, because that is
plainly what the gesture means; `Follow pointer` hands it back.

`Angle` is the most consequential light parameter in this shader rather than a
cosmetic one: the half-angle decides which wavelengths can reach the eye at all, so
raking the light widens the spectrum on offer.

## Layout

```
src/
  components/   Stage, Dock, ShapeRail, Slider, LightPad, ExportPanel
  hooks/        useTilt, useExport, useMotionExport
  lib/          artwork (decode + mask), edt (distance field), contour, shapes
  materials/    film
  scene/        Sticker, stickerGeometry, Backdrop, materials, handle
  shaders/      holographic, edge, shadow, silhouette
  state/        store
```

## Notes

- Satoshi is served from `public/fonts/` as a variable font.
- `prefers-reduced-motion` disables the idle drift and the Auto oscillation;
  direct manipulation still responds.
- Optional device-orientation tilt on phones (spec item 74) is not implemented;
  touch drag covers rotation.
