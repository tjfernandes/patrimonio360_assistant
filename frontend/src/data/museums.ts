import type { Museum } from '../types/museum'

export const museumsMock: Museum[] = [
  {
    museum_id: '8',
    slug: 'mnt',
    name: 'Museu Nacional do Traje',
    description:
      'Localizado no Palácio Angeja-Palmela, o Museu Nacional do Traje possui coleções de vestuário masculino e feminino desde o século XVIII até ao presente, incluindo acessórios de moda e estudos de conservação têxtil.',
    address: 'Largo Júlio Castilho, Lumiar, 1600-483 Lisboa, Portugal',
    inaguration_year: 1977,
    coordinates: { lat: 38.775163, lon: -9.164985 },
  },
  {
    museum_id: 'mnaz',
    slug: 'mnaz',
    name: 'Museu Nacional do Azulejo',
    description:
      'Situado no antigo Convento da Madre de Deus, o Museu Nacional do Azulejo apresenta a história do azulejo em Portugal, do século XV à contemporaneidade, incluindo o célebre painel panorâmico de Lisboa pré-terremoto de 1755.',
    address: 'Rua da Madre de Deus, 4, 1900-312 Lisboa, Portugal',
    inaguration_year: 1980,
    coordinates: { lat: 38.7244, lon: -9.11389 },
  },
  {
    museum_id: 'mne',
    slug: 'mne',
    name: 'Museu Nacional de Etnologia',
    description:
      'O Museu Nacional de Etnologia em Lisboa possui uma das mais importantes coleções etnográficas de Portugal, com mais de 40 mil objetos que representam culturas portuguesas e internacionais, focando nas tradições, usos e costumes populares.',
    address: 'Av. Ilha da Madeira, 1400-203 Lisboa, Portugal',
    inaguration_year: 1965,
    coordinates: { lat: 38.7048, lon: -9.2085 },
  },
  {
    museum_id: 'mdjm',
    slug: 'mdjm',
    name: 'Museu Dr. Joaquim Manso',
    description:
      'Localizado na Nazaré, o Museu Dr. Joaquim Manso dedica-se à cultura, história e identidade nazarena, reunindo coleções de arqueologia, etnografia marítima e artesanato que ilustram a vida da comunidade piscatória.',
    address: 'Estrada do Farol, 2450-065 Nazaré, Portugal',
    inaguration_year: 1976,
    coordinates: { lat: 39.60636, lon: -9.07613 },
  },
  {
    museum_id: 'mnc',
    slug: 'mnc',
    name: 'Museu Nacional de Conímbriga',
    description:
      'O Museu Nacional de Conímbriga exibe achados arqueológicos do complexo romano de Conímbriga, incluindo mosaicos, esculturas e objetos do quotidiano, contextualizando a vida urbana na Lusitânia romana.',
    address: 'Conímbriga, Condeixa-a-Velha, 3150-220 Condeixa-a-Nova, Portugal',
    inaguration_year: 1962,
    coordinates: { lat: 40.098407, lon: -8.490475 },
  },
  {
    museum_id: 'mngv',
    slug: 'mngv',
    name: 'Museu Nacional Grão Vasco',
    description:
      'Instalado no antigo Paço Episcopal de Viseu, o Museu Nacional Grão Vasco preserva a maior coleção de obras do pintor Vasco Fernandes, além de arte sacra, pintura portuguesa e europeia dos séculos XVI a XVIII.',
    address: 'Largo de São Teotónio, 3500-195 Viseu, Portugal',
    inaguration_year: 1916,
    coordinates: { lat: 40.660153, lon: -7.911028 },
  },
  {
    museum_id: 'pna',
    slug: 'pna',
    name: 'Palácio Nacional da Ajuda',
    description:
      'O Palácio Nacional da Ajuda foi residência oficial da família real portuguesa no século XIX, destacando-se pelos interiores neoclássicos luxuosos, coleção de artes decorativas e exposições históricas permanentes.',
    address: 'Largo da Ajuda, 1349-021 Lisboa, Portugal',
    inaguration_year: 1795,
    coordinates: { lat: 38.7075, lon: -9.197778 },
  },
  {
    museum_id: 'mna',
    slug: 'mna',
    name: 'Museu Nacional de Arqueologia',
    description:
      'Localizado no Mosteiro dos Jerónimos, o Museu Nacional de Arqueologia possui a maior coleção arqueológica do país, com destaque para arte pré-histórica, romana e egípcia, incluindo o famoso Tesouro de Ourique.',
    address: 'Praça do Império, 1400-206 Lisboa, Portugal',
    inaguration_year: 1893,
    coordinates: { lat: 38.697278, lon: -9.207056 },
  },
  {
    museum_id: 'mnaa',
    slug: 'mnaa',
    name: 'Museu Nacional de Arte Antiga',
    description:
      'O Museu Nacional de Arte Antiga alberga a mais significativa coleção de arte portuguesa dos séculos XII a XIX, incluindo pintura, escultura, ourivesaria, mobiliário e as célebres Tábuas de São Vicente de Fora.',
    address: 'Rua das Janelas Verdes, 1249-017 Lisboa, Portugal',
    inaguration_year: 1884,
    coordinates: { lat: 38.7053, lon: -9.16072 },
  },
  {
    museum_id: 'mntd',
    slug: 'mntd',
    name: 'Museu Nacional do Teatro e da Dança',
    description:
      'O Museu Nacional do Teatro e da Dança conserva cenários, figurinos, fotografias, cartazes e documentos que narram a história do teatro e da dança em Portugal, representando artistas, companhias e espetáculos icónicos.',
    address: 'Estrada do Lumiar, 10, 1600-495 Lisboa, Portugal',
    inaguration_year: 1985,
    coordinates: { lat: 38.774588, lon: -9.166714 },
  },
  {
    museum_id: 'mnfmc',
    slug: 'mnfmc',
    name: 'Museu Nacional Frei Manuel do Cenáculo',
    description:
      'Localizado em Évora, o Museu Nacional Frei Manuel do Cenáculo exibe coleções de arqueologia, pintura, escultura e artes decorativas, instaladas no antigo Seminário Maior e na Igreja das Mercês.',
    address: 'Largo Conde Vila Flor, 7000-804 Évora, Portugal',
    inaguration_year: 1915,
    coordinates: { lat: 38.571944, lon: -7.906944 },
  },
  {
    museum_id: 'mc',
    slug: 'mc',
    name: 'Museu da Cerâmica',
    description:
      'Instalado num palacete do século XIX, o Museu da Cerâmica exibe uma vasta coleção de cerâmica portuguesa, destacando a produção das Caldas da Rainha com peças de Bordallo Pinheiro, faianças e azulejaria decorativa.',
    address: 'Rua Dr. Ilídio Amado, 2500-226 Caldas da Rainha, Portugal',
    inaguration_year: 1983,
    coordinates: { lat: 39.399577, lon: -9.130424 },
  },
  {
    museum_id: 'mdds',
    slug: 'mdds',
    name: 'Museu D. Diogo de Sousa',
    description:
      'O Museu D. Diogo de Sousa, em Braga, possui um acervo arqueológico que documenta a ocupação humana da região desde a pré-história até à época medieval, incluindo artefactos romanos e coleções de epigrafia.',
    address: 'Rua dos Bombeiros Voluntários, 4700-025 Braga, Portugal',
    inaguration_year: 1918,
    coordinates: { lat: 41.5463, lon: -8.42747 },
  },
  {
    museum_id: 'pnm',
    slug: 'pnm',
    name: 'Palácio Nacional de Mafra',
    description:
      'O Palácio Nacional de Mafra é um monumental conjunto barroco do século XVIII, integrando palácio, basílica e convento franciscano, famoso pela Biblioteca de Mafra com mais de 36 mil volumes raros e antigos.',
    address: 'Terreiro D. João V, 2640-492 Mafra, Portugal',
    inaguration_year: 1717,
    coordinates: { lat: 38.936922, lon: -9.326395 },
  },
  {
    museum_id: 'mnmc',
    slug: 'mnmc',
    name: 'Museu Nacional de Machado de Castro',
    description:
      'Instalado sobre o criptopórtico romano de Aeminium, o Museu Nacional de Machado de Castro possui coleções de escultura medieval, ourivesaria, tapeçaria flamenga e pintura renascentista, destacando-se como referência nacional.',
    address: 'Largo Dr. José Rodrigues, 3000-236 Coimbra, Portugal',
    inaguration_year: 1913,
    coordinates: { lat: 40.208792, lon: -8.425494 },
  },
  {
    museum_id: 'mab',
    slug: 'mab',
    name: 'Museu do Abade de Baçal',
    description:
      'O Museu do Abade de Baçal, em Bragança, apresenta coleções de arqueologia, numismática, etnografia e arte sacra, com destaque para as peças pré-romanas, romanas e medievais da região de Trás-os-Montes.',
    address: 'Rua Abade de Baçal, 5300-034 Bragança, Portugal',
    inaguration_year: 1915,
    coordinates: { lat: 41.805819, lon: -6.752989 },
  },
  {
    museum_id: 'mdb',
    slug: 'mdb',
    name: 'Museu dos Biscainhos',
    description:
      'O Museu dos Biscainhos está instalado num palácio barroco do século XVII e exibe coleções de artes decorativas, mobiliário, cerâmica, ourivesaria e instrumentos musicais, integrados nos ambientes originais do edifício.',
    address: 'Rua dos Biscainhos, 4700-415 Braga, Portugal',
    inaguration_year: 1978,
    coordinates: { lat: 41.5512, lon: -8.4297 },
  },
  {
    museum_id: 'mnac',
    slug: 'mnac',
    name: 'Museu Nacional de Arte Contemporânea - Museu do Chiado',
    description:
      'O Museu do Chiado conserva a mais importante coleção de arte portuguesa dos séculos XIX e XX, incluindo pintura, escultura e desenho de artistas como Columbano Bordalo Pinheiro, Amadeo de Souza-Cardoso e Almada Negreiros.',
    address: 'Rua Serpa Pinto, 4, 1200-444 Lisboa, Portugal',
    inaguration_year: 1911,
    coordinates: { lat: 38.708836, lon: -9.141183 },
  },
  {
    museum_id: 'cmag',
    slug: 'cmag',
    name: 'Casa-Museu Dr. Anastácio Gonçalves',
    description:
      'Instalada numa casa de 1904 projetada por Norte Júnior, reúne a coleção de arte do médico Anastácio Gonçalves, incluindo pintura naturalista portuguesa, porcelana chinesa, mobiliário, arte decorativa europeia e japonesa.',
    address: 'Avenida 5 de Outubro 6-8, 1050-055 Lisboa, Portugal',
    inaguration_year: 1980,
    coordinates: { lat: 38.732552, lon: -9.146449 },
  },
  {
    museum_id: 'mnsr',
    slug: 'mnsr',
    name: 'Museu Nacional Soares dos Reis',
    description:
      'O mais antigo museu público de arte em Portugal, fundado em 1833, reúne obras de pintura, escultura, gravura, cerâmica, ourivesaria, têxteis e joalharia dos séculos XIX e XX, destacando-se o núcleo dedicado ao escultor Soares dos Reis.',
    address: 'Rua D. Manuel II, 44, 4050-522 Porto, Portugal',
    inaguration_year: 1833,
    coordinates: { lat: 41.147778, lon: -8.621667 },
  },
  {
    museum_id: 'mndc',
    slug: 'mndc',
    name: 'Museu Nacional dos Coches',
    description:
      'Exibe a mais importante coleção de coches reais da Europa, com viaturas cerimoniais dos séculos XVI a XIX, destacando-se o Coche dos Oceanos e o Coche do Embaixador, testemunhos do esplendor da diplomacia e monarquia portuguesa.',
    address: 'Avenida da Índia, 136, 1300-300 Lisboa, Portugal',
    inaguration_year: 1905,
    coordinates: { lat: 38.696685, lon: -9.198172 },
  },
  {
    museum_id: 'mjm',
    slug: 'mjm',
    name: 'Museu José Malhoa',
    description:
      'Localizado nas Caldas da Rainha, exibe pintura naturalista e realista portuguesa dos séculos XIX e XX, com destaque para a obra de José Malhoa, além de coleções de escultura, cerâmica de Bordallo Pinheiro e artes decorativas.',
    address: 'Parque D. Carlos I, 2500-109 Caldas da Rainha, Portugal',
    inaguration_year: 1933,
    coordinates: { lat: 39.4008, lon: -9.134 },
  },
  {
    museum_id: 'map',
    slug: 'map',
    name: 'Museu de Arte Popular',
    description:
      'Situado em Belém, o Museu de Arte Popular apresenta coleções de etnografia portuguesa, incluindo trajes regionais, máscaras, cerâmica, cestaria, pintura mural, objetos rituais e arte popular do século XX ao presente.',
    address: 'Avenida de Brasília, 1400-038 Lisboa, Portugal',
    inaguration_year: 1948,
    coordinates: { lat: 38.693658, lon: -9.208366 },
  },
  {
    museum_id: 'mnm',
    slug: 'mnm',
    name: 'Museu Nacional da Música',
    description:
      'Reúne uma das mais importantes coleções de instrumentos musicais da Europa, incluindo cravos, pianos históricos, violinos Stradivarius, instrumentos portugueses tradicionais e partituras raras desde o século XVI.',
    address: 'Terreiro D. João V, 2640-492 Mafra, Portugal',
    inaguration_year: 2025,
    coordinates: { lat: 38.937397, lon: -9.326797 },
  },
  {
    museum_id: 'mas',
    slug: 'mas',
    name: 'Museu de Alberto Sampaio',
    description:
      'Situado no centro histórico de Guimarães, o museu integra o claustro da Colegiada de Nossa Senhora da Oliveira e apresenta coleções de arte sacra medieval, pintura, escultura, ourivesaria e têxteis litúrgicos.',
    address: 'Rua Alfredo Guimarães, 4800-407 Guimarães, Portugal',
    inaguration_year: 1928,
    coordinates: { lat: 41.442639, lon: -8.292278 },
  },
  {
    museum_id: 'mj',
    slug: 'mj',
    name: 'Mosteiro dos Jerónimos',
    description:
      'Foi fundado por D. Manuel em 1498 para a Ordem de São Jerónimo, no local onde o Infante D. Henrique (1394-1460) mandara construir uma ermida dedicada a Santa Maria de Belém. A primiera pedra foi lançada em 1502 (ou 1501) segundo o projeto de Diogo de Boitaca, que orientou a primeira campanha d obras (terminada em 1516), e de João de Castilho, que comandou a segunda (1517-1522). A Castilho se deve a porta principal, a sacristia e o claustro. A porta poente é de autoria de Nicolau Chanterene. D. João III (reinado 1521-1557) apoiou a continuação da obra, mas, em 1569, estas foram suspensas e D. Catarina da Áustria (1507-1578) mandou refazer a capela-mor ao gosto renascentista, entregando a empreitada a João de Ruão. O Mosteiro sobrevive ao Terramoto, mas não à extinção das ordens religiosas. Depois de 1834, o edifício foi ocupado pela Casa Pia de Lisboa. As obras de restauro no século XIX alteraram-lhe toda a galeria de arcadas e poente da igreja e acrescentaram-lhe uma cúpula nuam das torres. Atualmente o edifício acolhe também a Casa Pia, o Museu da Marinha e o Museu Nacional de Arqueologia.',
    address: 'Praça do Império 1400-206 Lisboa',
    inaguration_year: 1502,
    coordinates: { lat: 38.697846, lon: -9.205601 },
  },
]
