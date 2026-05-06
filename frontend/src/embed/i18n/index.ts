import type { ChatLanguage } from '../types'

type TranslationNode = string | TranslationTree
interface TranslationTree {
  [key: string]: TranslationNode
}

const TRANSLATIONS: Record<ChatLanguage, TranslationTree> = {
  pt: {
    chatWidget: {
      defaultImageQuery: '',
      defaultModelQuery: '',
      unsupportedFormat: 'Formato nao suportado. Usa imagem ou ficheiro .glb/.gltf/.obj.',
      imageLabel: 'Imagem',
      modelLabel: 'Modelo 3D',
      tooLarge: '{itemLabel} demasiado grande. Limite: {maxMb} MB.',
      preparingRequest: 'A preparar pedido...',
      preparingRegeneration: 'A preparar regeneracao...',
      processing: 'A processar...',
      errorPrefix: 'Erro',
      backendNoReply: 'Nao foi possivel obter resposta do backend.',
      visualResult: 'Resultado visual',
      tourObjects: 'Objetos na tour',
      viewInTour: 'Ver na tour',
      assistant: 'Assistente',
      newConversation: 'Nova conversa',
      close: 'Fechar',
      welcome: 'Bem-vindo',
      welcomeTitle: 'Assistente Virtual AMALIA',
      welcomeDescription:
        'Escreve uma pergunta sobre o museu ou envia uma imagem para pesquisa visual no acervo.',
      assistantBadge: 'AMALIA',
      refreshSystemMessageAria: 'Atualizar mensagem do sistema',
      refreshMessageTitle: 'Atualizar mensagem',
      copySystemMessageAria: 'Copiar mensagem do sistema',
      copied: 'Copiado',
      copyMessage: 'Copiar mensagem',
      uploadedImageAlt: 'Imagem enviada',
      uploadedModelCaption: 'Modelo 3D enviado para pesquisa visual',
      modelViewerLoading: 'A carregar modelo 3D...',
      modelViewerError: 'Nao foi possivel visualizar este modelo.',
      attachDropHint: 'Arrasta imagem ou modelo 3D para aqui, ou usa o clip.',
      modelReady: 'Modelo 3D pronto para pesquisa visual',
      imageReady: 'Imagem pronta para pesquisa visual',
      remove: 'Remover',
      attachmentPreviewTitle: 'Preview textual do anexo',
      attachmentPreviewDescription:
        'O backend vai gerar vistas 2D deste modelo para pesquisar no indice de imagens.',
      attachFile: 'Anexar ficheiro',
      inputPlaceholder: 'Escreve uma mensagem...',
      microphoneSoon: 'Microfone (em breve)',
      sending: 'A enviar...',
      send: 'Enviar',
      dropToAttach: 'Larga aqui para anexar',
      dropHint: 'Imagens ou modelos 3D (.glb, .gltf, .obj)',
      lightboxAria: 'Visualizacao ampliada da imagem',
    },
    chatApi: {
      emptyReply: 'Resposta vazia do backend.',
      backendFailure: 'Falha no backend ({status}).',
      streamWithoutBody: 'Resposta de stream sem body.',
      backendStreamError: 'Erro no stream do backend.',
      streamWithoutResult: 'Stream terminou sem resposta final.',
      backendNotConfigured: 'Backend de chat nao configurado (VITE_CHAT_BACKEND_BASE_URL).',
      networkError: 'Erro de rede ao contactar o backend de chat.',
    },
    assistantEmbed: {
      enterFullscreen: 'Fullscreen',
      exitFullscreen: 'Sair fullscreen',
      virtualTour: 'Tour virtual',
    },
    embedPage: {
      loading: 'A carregar o embed...',
      invalid: 'Embed invalido. Usa um caminho no formato `/embed/mnaz`.',
    },
  },
  en: {
    chatWidget: {
      defaultImageQuery: 'Help me identify this image in the context of the current museum.',
      defaultModelQuery: 'Help me identify this 3D model in the context of the current museum.',
      unsupportedFormat: 'Unsupported format. Use an image or a .glb/.gltf/.obj file.',
      imageLabel: 'Image',
      modelLabel: '3D Model',
      tooLarge: '{itemLabel} is too large. Limit: {maxMb} MB.',
      preparingRequest: 'Preparing request...',
      preparingRegeneration: 'Preparing regeneration...',
      processing: 'Processing...',
      errorPrefix: 'Error',
      backendNoReply: 'Could not get a response from the backend.',
      visualResult: 'Visual result',
      tourObjects: 'Objects in tour',
      viewInTour: 'View in tour',
      assistant: 'Assistant',
      newConversation: 'New conversation',
      close: 'Close',
      welcome: 'Welcome',
      welcomeTitle: 'AMALIA Virtual Assistant',
      welcomeDescription:
        'Ask a question about the museum or upload an image for visual collection search.',
      assistantBadge: 'SYSTEM',
      refreshSystemMessageAria: 'Regenerate assistant message',
      refreshMessageTitle: 'Regenerate message',
      copySystemMessageAria: 'Copy assistant message',
      copied: 'Copied',
      copyMessage: 'Copy message',
      uploadedImageAlt: 'Uploaded image',
      uploadedModelCaption: '3D model uploaded for visual search',
      modelViewerLoading: 'Loading 3D model...',
      modelViewerError: 'Could not preview this model.',
      attachDropHint: 'Drop an image or 3D model here, or use the clip button.',
      modelReady: '3D model ready for visual search',
      imageReady: 'Image ready for visual search',
      remove: 'Remove',
      attachmentPreviewTitle: 'Attachment preview',
      attachmentPreviewDescription:
        'The backend will generate 2D views of this model to search the image index.',
      attachFile: 'Attach file',
      inputPlaceholder: 'Type a message...',
      microphoneSoon: 'Microphone (soon)',
      sending: 'Sending...',
      send: 'Send',
      dropToAttach: 'Drop here to attach',
      dropHint: 'Images or 3D models (.glb, .gltf, .obj)',
      lightboxAria: 'Expanded image view',
    },
    chatApi: {
      emptyReply: 'Empty reply from backend.',
      backendFailure: 'Backend request failed ({status}).',
      streamWithoutBody: 'Stream response has no body.',
      backendStreamError: 'Backend stream error.',
      streamWithoutResult: 'Stream ended without a final response.',
      backendNotConfigured: 'Chat backend not configured (VITE_CHAT_BACKEND_BASE_URL).',
      networkError: 'Network error while contacting chat backend.',
    },
    assistantEmbed: {
      enterFullscreen: 'Fullscreen',
      exitFullscreen: 'Exit fullscreen',
      virtualTour: 'Virtual tour',
    },
    embedPage: {
      loading: 'Loading embed...',
      invalid: 'Invalid embed. Use a path in the format `/embed/mnaz`.',
    },
  },
}

type InterpolationParams = Record<string, string | number>

export function resolveEmbedLanguage(language?: string | null): ChatLanguage {
  return language?.trim().toLowerCase() === 'en' ? 'en' : 'pt'
}

function lookupTranslation(
  language: ChatLanguage,
  key: string,
): string | null {
  const segments = key.split('.').filter(Boolean)
  let value: TranslationNode | undefined = TRANSLATIONS[language]
  for (const segment of segments) {
    if (!value || typeof value === 'string') {
      return null
    }
    value = value[segment]
  }

  return typeof value === 'string' ? value : null
}

function interpolate(template: string, params?: InterpolationParams): string {
  if (!params) {
    return template
  }
  return template.replace(/\{(\w+)\}/g, (_, token: string) => {
    if (!(token in params)) {
      return `{${token}}`
    }
    return String(params[token])
  })
}

export function t(
  language: ChatLanguage,
  key: string,
  params?: InterpolationParams,
): string {
  const fallbackLanguage: ChatLanguage = language === 'en' ? 'pt' : 'en'
  const resolved =
    lookupTranslation(language, key) ??
    lookupTranslation(fallbackLanguage, key) ??
    key
  return interpolate(resolved, params)
}
