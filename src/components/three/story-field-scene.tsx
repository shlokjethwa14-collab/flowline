'use client'

import * as React from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/**
 * The pinned field behind the landing story.
 *
 * One fixed full-screen canvas that never scrolls; the document slides past
 * it and feeds it a 0…1 progress value. Everything the scene does — the
 * camera push, the colour shift, the way the particles gather and disperse —
 * is a function of that single number, which is what makes the whole page
 * feel like one continuous move rather than a stack of separate sections.
 *
 * Progress is written through a ref rather than a prop so scrolling never
 * re-renders React. The scene reads it once per frame.
 */

/** How far the camera travels toward the field across the whole story. */
const CAMERA_TRAVEL = 5.5

/** Colour the field passes through, keyed to story progress. */
const STOPS: Array<{ at: number; color: THREE.Color }> = [
  { at: 0, color: new THREE.Color('#6d58f0') },
  { at: 0.35, color: new THREE.Color('#4f9ff0') },
  { at: 0.7, color: new THREE.Color('#2fbfa0') },
  { at: 1, color: new THREE.Color('#6d58f0') },
]

/** Allocated once — building a Color inside the render loop churns the heap. */
const WHITE = new THREE.Color('#ffffff')

function colorAt(t: number, out: THREE.Color) {
  for (let i = 0; i < STOPS.length - 1; i += 1) {
    const a = STOPS[i]!
    const b = STOPS[i + 1]!
    if (t <= b.at) {
      const span = b.at - a.at
      const local = span === 0 ? 0 : (t - a.at) / span
      return out.copy(a.color).lerp(b.color, local)
    }
  }
  return out.copy(STOPS[STOPS.length - 1]!.color)
}

export default function StoryFieldScene({
  progressRef,
}: {
  /** 0 at the top of the story, 1 at the bottom. Read every frame. */
  progressRef: React.MutableRefObject<number>
}) {
  const hostRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6))
    renderer.setClearAlpha(0)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    host.appendChild(renderer.domElement)
    Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' })

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)

    const pmrem = new THREE.PMREMGenerator(renderer)
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04)
    scene.environment = envTarget.texture

    scene.add(new THREE.AmbientLight(0xffffff, 0.8))
    const key = new THREE.DirectionalLight(0xffffff, 2)
    key.position.set(3, 5, 4)
    scene.add(key)

    // --- Backdrop -----------------------------------------------------------
    // The scene has to paint its own ground. Glass refracts whatever is behind
    // it, and over the page's plain background that is nothing — the core came
    // out invisible. A skydome also gives the points something to read against;
    // additive blending over a white page adds no light at all.
    const backdrop = new THREE.Mesh(
      new THREE.SphereGeometry(40, 32, 32),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uTop: { value: new THREE.Color('#ffffff') },
          uBottom: { value: new THREE.Color('#eef0f6') },
          uAccent: { value: new THREE.Color('#6d58f0') },
          uAccentStrength: { value: 0.35 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vPos;
          void main() {
            vPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uTop;
          uniform vec3 uBottom;
          uniform vec3 uAccent;
          uniform float uAccentStrength;
          varying vec3 vPos;
          void main() {
            vec3 dir = normalize(vPos);
            // Vertical ramp, then a soft accent bloom toward the centre so the
            // dome is not a flat wash behind the core.
            float ramp = smoothstep(-0.7, 0.8, dir.y);
            vec3 base = mix(uBottom, uTop, ramp);
            // Pushed below centre: the bloom is the most saturated part of
            // the field, and the headline sits dead centre. Keeping it low
            // leaves the copy over the flatter, lighter part of the ramp.
            float bloom = pow(max(0.0, 1.0 - length(dir.xy - vec2(0.0, -0.42)) * 1.15), 2.4);
            gl_FragColor = vec4(mix(base, uAccent, bloom * uAccentStrength), 1.0);
          }
        `,
      }),
    )
    scene.add(backdrop)

    /**
     * Reads the palette off the live theme rather than guessing. The `dark`
     * class is toggled on <html> by the inline theme script, so this stays
     * correct through a theme switch without a remount.
     */
    function syncPalette() {
      const dark = document.documentElement.classList.contains('dark')
      const uniforms = (backdrop.material as THREE.ShaderMaterial).uniforms
      // The light palette is deliberately tinted rather than near-white.
      // Glass refracts whatever is behind it, so a white dome produces white
      // glass on a white page — the core rendered perfectly and was invisible.
      // A field needs a colour before anything in front of it can read.
      // Light stays genuinely light. The field is a background for dark body
      // copy, and a mid-tone lavender drops that text under a readable
      // contrast ratio — tinted enough to give the glass something to bend,
      // pale enough to read a paragraph over.
      uniforms.uTop!.value.set(dark ? '#0a0a11' : '#f7f8ff')
      uniforms.uBottom!.value.set(dark ? '#191932' : '#e3e8fb')
      uniforms.uAccentStrength!.value = dark ? 0.72 : 0.28
      // Additive light only reads on a dark ground; over a near-white dome it
      // adds nothing, so the light theme draws the points normally instead.
      fieldMaterial.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending
      fieldMaterial.opacity = dark ? 0.85 : 0.5
      fieldMaterial.needsUpdate = true
    }

    // --- The core: one glass form the whole story orbits ------------------
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.1, 6),
      new THREE.MeshPhysicalMaterial({
        // Not fully transmissive: a little body and a clearcoat give the form
        // an edge and a specular hit, so it stays legible against a backdrop
        // close to its own colour.
        transmission: 0.92,
        thickness: 1.4,
        roughness: 0.06,
        metalness: 0,
        ior: 1.48,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        iridescence: 0.6,
        iridescenceIOR: 1.4,
        transparent: true,
      }),
    )
    // Off dead centre, for the same reason as the bloom: the copy owns the
    // middle of the screen, and a refracting sphere directly behind a
    // headline makes the headline hard to read.
    core.position.set(0, -2.55, 0)
    scene.add(core)

    // --- The field: points that gather toward the core, then scatter ------
    const COUNT = 1400
    const positions = new Float32Array(COUNT * 3)
    /** Where each point sits when fully dispersed. */
    const scattered = new Float32Array(COUNT * 3)
    /** Where each point sits when fully gathered — a shell around the core. */
    const gathered = new Float32Array(COUNT * 3)

    for (let i = 0; i < COUNT; i += 1) {
      scattered[i * 3] = (Math.random() - 0.5) * 26
      scattered[i * 3 + 1] = (Math.random() - 0.5) * 18
      scattered[i * 3 + 2] = (Math.random() - 0.5) * 20

      // Fibonacci sphere: an even shell, where uniform random angles would
      // clump the points at the poles.
      const phi = Math.acos(1 - (2 * (i + 0.5)) / COUNT)
      const theta = Math.PI * (1 + Math.sqrt(5)) * i
      const radius = 2.1 + Math.random() * 0.5
      gathered[i * 3] = Math.cos(theta) * Math.sin(phi) * radius
      gathered[i * 3 + 1] = Math.sin(theta) * Math.sin(phi) * radius
      gathered[i * 3 + 2] = Math.cos(phi) * radius
    }
    positions.set(scattered)

    const fieldGeometry = new THREE.BufferGeometry()
    fieldGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const fieldMaterial = new THREE.PointsMaterial({
      size: 0.06,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const field = new THREE.Points(fieldGeometry, fieldMaterial)
    scene.add(field)

    syncPalette()
    // The theme can change while the story is open; the toggle writes a class
    // on <html>, so watch for it rather than sampling once at mount.
    const themeObserver = new MutationObserver(syncPalette)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    function resize() {
      const { clientWidth, clientHeight } = host!
      if (clientWidth === 0 || clientHeight === 0) return
      renderer.setSize(clientWidth, clientHeight, false)
      camera.aspect = clientWidth / clientHeight
      camera.updateProjectionMatrix()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    resize()

    const tint = new THREE.Color()
    const clock = new THREE.Clock()
    let frame = 0
    /** Eased progress, so a fling on the wheel does not snap the scene. */
    let smoothed = progressRef.current

    function tick() {
      frame = requestAnimationFrame(tick)
      if (document.hidden) return

      const target = THREE.MathUtils.clamp(progressRef.current, 0, 1)
      smoothed += (target - smoothed) * (reduced ? 1 : 0.08)
      const t = clock.getElapsedTime()

      camera.position.set(0, 0, 9 - smoothed * CAMERA_TRAVEL)
      camera.lookAt(0, 0, 0)

      colorAt(smoothed, tint)
      fieldMaterial.color.copy(tint)
      ;(core.material as THREE.MeshPhysicalMaterial).color.copy(tint).lerp(WHITE, 0.55)
      ;((backdrop.material as THREE.ShaderMaterial).uniforms.uAccent!.value as THREE.Color).copy(tint)

      if (!reduced) {
        core.rotation.y = t * 0.12 + smoothed * Math.PI
        core.rotation.x = Math.sin(t * 0.2) * 0.12
        field.rotation.y = -t * 0.03
      }

      // Gather through the middle of the story, disperse again at the end —
      // the shape of the argument the copy is making.
      const gatherAmount = Math.sin(THREE.MathUtils.clamp(smoothed, 0, 1) * Math.PI)
      const attr = fieldGeometry.getAttribute('position') as THREE.BufferAttribute
      const array = attr.array as Float32Array
      for (let i = 0; i < COUNT * 3; i += 1) {
        array[i] = THREE.MathUtils.lerp(scattered[i]!, gathered[i]!, gatherAmount)
      }
      attr.needsUpdate = true

      renderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      themeObserver.disconnect()
      // WebGL resources are not garbage collected.
      core.geometry.dispose()
      ;(core.material as THREE.Material).dispose()
      backdrop.geometry.dispose()
      ;(backdrop.material as THREE.Material).dispose()
      fieldGeometry.dispose()
      fieldMaterial.dispose()
      envTarget.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [progressRef])

  return <div ref={hostRef} className="h-full w-full" />
}
