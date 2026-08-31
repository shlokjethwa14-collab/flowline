'use client'

import * as React from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/**
 * The login showpiece: a stack of refracting glass slabs.
 *
 * This is the ONE place WebGL is used. The working app is CSS depth, because
 * a factory phone should not run a transmission shader to look at a task
 * list. It is mounted lazily and only when the device can handle it — see
 * `glass-hero.tsx` for the capability gate.
 *
 * Written against three directly rather than react-three-fiber. Fiber's
 * reconciler reaches into React's private internals, which Next bundles its
 * own copy of; the versions disagree and the scene throws on import. Nothing
 * here is interactive enough to want a reconciler anyway — it is a handful of
 * meshes and a render loop, and doing it by hand costs less than the two
 * packages it replaces.
 */

const SLAB_TINTS = ['#dbeafe', '#ffffff', '#e9d5ff', '#ffffff', '#ccfbf1'] as const

/** Extruded rounded rectangle — three has no rounded box primitive. */
function roundedSlabGeometry(width: number, height: number, radius: number, depth: number) {
  const shape = new THREE.Shape()
  const x = -width / 2
  const y = -height / 2

  shape.moveTo(x + radius, y)
  shape.lineTo(x + width - radius, y)
  shape.quadraticCurveTo(x + width, y, x + width, y + radius)
  shape.lineTo(x + width, y + height - radius)
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  shape.lineTo(x + radius, y + height)
  shape.quadraticCurveTo(x, y + height, x, y + height - radius)
  shape.lineTo(x, y + radius)
  shape.quadraticCurveTo(x, y, x + radius, y)

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 4,
    curveSegments: 12,
  })
  // Extrude builds from z=0 forward; centre it so rotation happens about the
  // slab's middle rather than its back face.
  geometry.translate(0, 0, -depth / 2)
  geometry.computeVertexNormals()
  return geometry
}

export default function GlassHeroScene() {
  const hostRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    // Cap the pixel ratio: a 3x display would otherwise shade this
    // transmission material nine times over for no visible gain.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6))
    renderer.setClearAlpha(0)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    host.appendChild(renderer.domElement)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    camera.position.set(0, 0, 6)

    // Transmission needs something to refract. A procedural room costs one
    // render at startup and no network request.
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04)
    scene.environment = envTarget.texture

    scene.add(new THREE.AmbientLight(0xffffff, 0.7))

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2)
    keyLight.position.set(4, 6, 5)
    scene.add(keyLight)

    const rimLight = new THREE.DirectionalLight(0xa78bfa, 1.1)
    rimLight.position.set(-5, -2, -4)
    scene.add(rimLight)

    const group = new THREE.Group()
    scene.add(group)

    const geometry = roundedSlabGeometry(2.1, 2.7, 0.34, 0.14)
    const materials: THREE.MeshPhysicalMaterial[] = []
    const slabs: THREE.Mesh[] = []
    /** Resting height per slab; the drift is applied on top of it. */
    const baseY: number[] = []

    SLAB_TINTS.forEach((tint, index) => {
      const material = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(tint),
        // Transmission is what makes it read as glass rather than plastic:
        // light passes through and bends, so the slabs behind distort.
        transmission: 1,
        thickness: 0.55,
        roughness: 0.12,
        metalness: 0,
        ior: 1.42,
        iridescence: 0.25,
        iridescenceIOR: 1.3,
        specularIntensity: 1,
        transparent: true,
      })
      const mesh = new THREE.Mesh(geometry, material)
      const offset = index - (SLAB_TINTS.length - 1) / 2
      // Fanned, not stacked. Perfectly aligned slabs merge into one grey
      // block once transmission blurs them together; staggering them keeps
      // each edge visible, which is the whole point of the stack.
      mesh.position.set(offset * 0.26, offset * -0.14, offset * 0.46)
      mesh.rotation.z = offset * 0.055
      group.add(mesh)
      materials.push(material)
      slabs.push(mesh)
      baseY.push(mesh.position.y)
    })

    // Pointer, normalised to -1…1 across the host element.
    const pointer = new THREE.Vector2(0, 0)
    function onPointerMove(event: PointerEvent) {
      if (event.pointerType !== 'mouse') return
      const rect = host!.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = ((event.clientY - rect.top) / rect.height) * 2 - 1
    }
    // Listening on the window, not the host: the hero sits behind the sign-in
    // copy with `pointer-events: none`, so it would never see its own events.
    window.addEventListener('pointermove', onPointerMove, { passive: true })

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

    // Only run the loop when the scene is actually on screen and the tab is
    // in front. A transmission shader is the most expensive thing in the app;
    // it has no business burning frames behind another window.
    let visible = true
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? true
      },
      { threshold: 0 },
    )
    intersectionObserver.observe(host)

    const clock = new THREE.Clock()
    let frame = 0

    function tick() {
      frame = requestAnimationFrame(tick)
      if (!visible || document.hidden) return

      if (!reduced) {
        const t = clock.getElapsedTime()
        slabs.forEach((mesh, index) => {
          const phase = index * 0.7
          mesh.position.y = (baseY[index] ?? 0) + Math.sin(t * 0.4 + phase) * 0.06
          mesh.rotation.x = THREE.MathUtils.lerp(
            mesh.rotation.x,
            -pointer.y * 0.18 + Math.sin(t * 0.3 + phase) * 0.03,
            0.04,
          )
          mesh.rotation.y = THREE.MathUtils.lerp(
            mesh.rotation.y,
            pointer.x * 0.26 + Math.cos(t * 0.25 + phase) * 0.03,
            0.04,
          )
        })
        group.rotation.z = Math.sin(t * 0.15) * 0.03
      }

      renderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onPointerMove)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      // WebGL resources are not garbage collected — every one of these leaks
      // GPU memory if it is not released by hand.
      geometry.dispose()
      materials.forEach((material) => material.dispose())
      envTarget.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div ref={hostRef} className="h-full w-full" />
}
