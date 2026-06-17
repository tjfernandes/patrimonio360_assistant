export interface ChatImageMatch {
  originalImageName: string
  artifactId?: string
  score?: number
  title?: string
  inventory?: string
  artifact?: ChatArtifactResult
  navigationTarget?: ChatNavigationTarget
}

export interface ChatArtifactImage {
  originalImageName?: string
  imageId?: string
  imageOrder?: number
  localPath?: string
  sourceUrl?: string
  caption?: string
  altText?: string
}

export interface ChatArtifactResult {
  artifactId: string
  tipoInventario?: string
  inventoryNumber?: string
  title?: string
  museumId?: string
  museum?: string
  category?: string
  superCategory?: string
  // creator (string) mantido para retrocompatibilidade; usar creators[].
  creator?: string
  creators: string[]
  creatorIds: string[]
  dateOrPeriod?: string
  dateYearStart?: number
  dateYearEnd?: number
  supportOrMaterial?: string
  technique?: string
  originHistory?: string
  incorporation?: string
  productionCenter?: string
  description?: string
  searchText?: string
  detailType?: string
  detailUrl?: string
  inTour?: boolean
  // Relacoes (export relacional do RAIZ).
  sets: string[]
  setIds: string[]
  setNumbers: string[]
  exhibitions: string[]
  exhibitionIds: string[]
  exhibitionTypes: string[]
  exhibitionCount?: number
  bibliography?: string
  bibliographyCount?: number
  imageCount?: number
  images: ChatArtifactImage[]
}

// Schemas para o endpoint /artifacts/{id}/detail-context.

export interface ArtifactAuthor {
  entityId: string
  name?: string
  atividade?: string
  dataNascimento?: string
  dataObito?: string
  localNascimento?: string
  localObito?: string
  biografia?: string
  biography?: string
  url?: string
  nObjetos?: number
}

export interface RelatedArtifact {
  artifactId: string
  inventoryNumber?: string
  title?: string
  museumId?: string
  museum?: string
  category?: string
  creators: string[]
  dateOrPeriod?: string
  detailType?: string
  detailUrl?: string
  inTour: boolean
  imageCount?: number
  images: ChatArtifactImage[]
  navigationTarget?: ChatNavigationTarget
}

export interface ArtifactSetContext {
  entityId: string
  name?: string
  numConjunto?: string
  historial?: string
  descricao?: string
  url?: string
  nObjetos?: number
  artifacts: RelatedArtifact[]
  artifactsReturned: number
}

export interface ArtifactExhibitionContext {
  entityId: string
  name?: string
  tipoExposicao?: string
  local?: string
  anoInicial?: number
  anoFinal?: number
  texto?: string
  fichaTecnica?: string
  url?: string
  nObjetos?: number
  artifacts: RelatedArtifact[]
  artifactsReturned: number
}

export interface ArtifactDetailContext {
  artifactId: string
  authors: ArtifactAuthor[]
  sets: ArtifactSetContext[]
  exhibitions: ArtifactExhibitionContext[]
}

export type ChatUploadKind = 'image' | 'model'
export type ChatLanguage = 'pt' | 'en'
export type ChatModelFormat = 'gltf' | 'obj'

export interface ChatNavigationTarget {
  overlayId: string
  panoramaKey: string
  inventoryId: string
  location?: string
  title?: string
}

export interface TourNavigationCommandContext {
  sessionId: string
  conversationId?: string | null
  queryId?: string | null
  participantId?: string | null
  taskId?: string | null
  tourId?: string | null
  language?: ChatLanguage
  artifactId?: string | null
  inventoryNumber?: string | null
  title?: string | null
  source?: string | null
}

export interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  text: string
  queryId?: string | null
  isCenteredNotice?: boolean
  imageMatches?: ChatImageMatch[]
  artifactResults?: ChatArtifactResult[]
  navigationTargets?: ChatNavigationTarget[]
  uploadedAssetKind?: ChatUploadKind
  uploadedAssetName?: string
  uploadedImageUrl?: string
  uploadedModelUrl?: string
  uploadedModelFormat?: ChatModelFormat
  resultsPage?: number
  resultsPageSize?: number
  resultsTotal?: number
  resultsHasMore?: boolean
  resultsRequestId?: string | null
  isLoadingMoreResults?: boolean
  loadMoreResultsError?: string | null
}

export interface TourAssistantEmbedProps {
  museumSlug: string
  museumId: string
  museumName: string
  tourUrl: string
  backendBaseUrl?: string
  initialLanguage?: ChatLanguage
  fullscreenButtonClassName?: string
}
