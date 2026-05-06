import { Bounds, Html, OrbitControls, useGLTF } from '@react-three/drei'
import { Canvas, useLoader } from '@react-three/fiber'
import { Component, Suspense } from 'react'
import type { ReactNode } from 'react'
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
    <div className={className}>
      <ModelErrorBoundary viewerKey={viewerKey} fallback={<ViewerFallback label={errorLabel} />}>
        <Canvas
          dpr={[1, 2]}
          camera={{ position: [2.2, 1.4, 2.2], fov: 42 }}
          gl={{ antialias: true, alpha: true }}
        >
          <color attach="background" args={['#f8f3f2']} />
          <ambientLight intensity={0.7} />
          <directionalLight position={[4, 6, 4]} intensity={1.1} />
          <directionalLight position={[-3, 2.5, -1.5]} intensity={0.4} />
          <Suspense fallback={<LoadingFallback label={loadingLabel} />}>
            <Bounds fit clip margin={0.85}>
              {resolvedFormat === 'obj' ? (
                <ObjModel modelUrl={modelUrl} />
              ) : (
                <GltfModel modelUrl={modelUrl} />
              )}
            </Bounds>
          </Suspense>
          <OrbitControls
            enablePan={false}
            enableDamping
            dampingFactor={0.08}
            rotateSpeed={0.65}
            minDistance={0.75}
            maxDistance={12}
          />
        </Canvas>
      </ModelErrorBoundary>
    </div>
  )
}

export default ModelAttachmentViewer
