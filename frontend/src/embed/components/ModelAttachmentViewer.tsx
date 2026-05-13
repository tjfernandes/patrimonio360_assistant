import { ContactShadows, Html, OrbitControls, useGLTF } from '@react-three/drei'
import { Canvas, useLoader, useThree } from '@react-three/fiber'
import { Component, Suspense, useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Box3, MOUSE, Matrix4, Quaternion, TOUCH, Vector3 } from 'three'
import type { Object3D, PerspectiveCamera } from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import type { ChatModelFormat } from '../types'

interface ModelAttachmentViewerProps {
  modelUrl: string
  modelName?: string
  modelFormat?: ChatModelFormat
  loadingLabel: string
  errorLabel: string
  className?: string
}

interface ErrorBoundaryProps {
  viewerKey: string
  fallback: ReactNode
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

const MODEL_FIT_MARGIN = 0.85
const reusableBox = new Box3()
const reusableSize = new Vector3()
const reusableCenter = new Vector3()
const reusableDirection = new Vector3()
const reusableLookAtMatrix = new Matrix4()
const reusableQuaternion = new Quaternion()

function extractExtensionFromReference(value?: string | null) {
  if (!value) {
    return null
  }
  const cleanValue = value.split('?')[0]?.split('#')[0] ?? ''
  const extension = cleanValue.split('.').pop()?.trim().toLowerCase() ?? ''
  return extension || null
}

function resolveModelFormat(
  modelUrl: string,
  modelName?: string,
  modelFormat?: ChatModelFormat,
): ChatModelFormat | null {
  if (modelFormat) {
    return modelFormat
  }
  const extension =
    extractExtensionFromReference(modelName) ?? extractExtensionFromReference(modelUrl)
  if (extension === 'obj') {
    return 'obj'
  }
  if (extension === 'glb' || extension === 'gltf') {
    return 'gltf'
  }
  return null
}

function ViewerFallback({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-lg border border-[#d8bfc0] bg-white/80 px-2 text-center text-[11px] font-semibold text-[#5e4750]">
      {label}
    </div>
  )
}

function LoadingFallback({ label }: { label: string }) {
  return (
    <Html center>
      <div className="rounded-md border border-[#d8bfc0] bg-white/92 px-2 py-1 text-[11px] font-semibold text-[#5e4750]">
        {label}
      </div>
    </Html>
  )
}

function GltfModel({ modelUrl }: { modelUrl: string }) {
  const gltf = useGLTF(modelUrl)
  return <primitive object={gltf.scene} />
}

function ObjModel({ modelUrl }: { modelUrl: string }) {
  const object = useLoader(OBJLoader, modelUrl)
  return <primitive object={object} />
}

function isPerspectiveCamera(camera: unknown): camera is PerspectiveCamera {
  return Boolean(camera && typeof camera === 'object' && 'isPerspectiveCamera' in camera)
}

function isOrbitControlsLike(
  controls: unknown,
): controls is { target: Vector3; maxDistance: number; update: () => void } {
  return Boolean(
    controls &&
      typeof controls === 'object' &&
      'target' in controls &&
      controls.target instanceof Vector3 &&
      'update' in controls &&
      typeof controls.update === 'function',
  )
}

function InstantModelFrame({ children }: { children: ReactNode }) {
  const groupRef = useRef<Object3D | null>(null)
  const { camera, controls, invalidate, size } = useThree()

  useLayoutEffect(() => {
    const group = groupRef.current
    if (!group || !isPerspectiveCamera(camera)) {
      return
    }

    group.updateWorldMatrix(true, true)
    reusableBox.setFromObject(group)
    if (reusableBox.isEmpty()) {
      return
    }

    reusableBox.getSize(reusableSize)
    reusableBox.getCenter(reusableCenter)
    const maxSize = Math.max(reusableSize.x, reusableSize.y, reusableSize.z)
    const fitHeightDistance = maxSize / (2 * Math.atan((Math.PI * camera.fov) / 360))
    const fitWidthDistance = fitHeightDistance / camera.aspect
    const distance = MODEL_FIT_MARGIN * Math.max(fitHeightDistance, fitWidthDistance)

    reusableDirection.copy(camera.position).sub(reusableCenter)
    if (reusableDirection.lengthSq() === 0) {
      reusableDirection.set(1, 0.7, 1)
    }
    reusableDirection.normalize()
    camera.position.copy(reusableCenter).addScaledVector(reusableDirection, distance)
    reusableLookAtMatrix.lookAt(camera.position, reusableCenter, camera.up)
    reusableQuaternion.setFromRotationMatrix(reusableLookAtMatrix)
    camera.quaternion.copy(reusableQuaternion)
    camera.near = Math.max(distance / 100, 0.001)
    camera.far = Math.max(distance * 100, 100)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()

    if (isOrbitControlsLike(controls)) {
      controls.target.copy(reusableCenter)
      controls.maxDistance = Math.max(distance * 30, 80)
      controls.update()
    }
    invalidate()
  }, [camera, controls, invalidate, size.width, size.height])

  return <group ref={groupRef}>{children}</group>
}

class ModelErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidUpdate(previousProps: ErrorBoundaryProps) {
    if (previousProps.viewerKey !== this.props.viewerKey && this.state.hasError) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}

function ModelAttachmentViewer({
  modelUrl,
  modelName,
  modelFormat,
  loadingLabel,
  errorLabel,
  className,
}: ModelAttachmentViewerProps) {
  const resolvedFormat = resolveModelFormat(modelUrl, modelName, modelFormat)
  if (!resolvedFormat) {
    return (
      <div className={className}>
        <ViewerFallback label={errorLabel} />
      </div>
    )
  }

  const viewerKey = `${resolvedFormat}:${modelUrl}`

  return (
    <div className={`relative overflow-hidden rounded-lg bg-[#f8f3f2] ${className ?? ''}`}>
      <ModelErrorBoundary viewerKey={viewerKey} fallback={<ViewerFallback label={errorLabel} />}>
        <Canvas
          dpr={[1, 2]}
          camera={{ position: [2.8, 1.8, 2.8], fov: 38 }}
          gl={{ antialias: true, alpha: true }}
          shadows
        >
          <color attach="background" args={['#f8f3f2']} />
          <hemisphereLight args={['#fff7f2', '#2d4058', 1.35]} />
          <directionalLight
            position={[4, 6, 4]}
            intensity={1.45}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
          />
          <directionalLight position={[-3, 2.5, -1.5]} intensity={0.55} />
          <Suspense fallback={<LoadingFallback label={loadingLabel} />}>
            <InstantModelFrame>
              {resolvedFormat === 'obj' ? (
                <ObjModel modelUrl={modelUrl} />
              ) : (
                <GltfModel modelUrl={modelUrl} />
              )}
            </InstantModelFrame>
            <ContactShadows
              position={[0, -0.58, 0]}
              opacity={0.24}
              scale={6}
              blur={2.6}
              far={3}
            />
          </Suspense>
          <OrbitControls
            enablePan
            enableDamping
            dampingFactor={0.08}
            rotateSpeed={0.65}
            panSpeed={0.65}
            zoomSpeed={1.25}
            screenSpacePanning
            minDistance={0.12}
            maxDistance={80}
            mouseButtons={{
              LEFT: MOUSE.ROTATE,
              MIDDLE: MOUSE.DOLLY,
              RIGHT: MOUSE.PAN,
            }}
            touches={{
              ONE: TOUCH.ROTATE,
              TWO: TOUCH.DOLLY_PAN,
            }}
          />
        </Canvas>
      </ModelErrorBoundary>
    </div>
  )
}

export default ModelAttachmentViewer
