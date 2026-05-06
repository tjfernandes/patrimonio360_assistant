import type { Museum } from '../types/museum'

export const museumsMock: Museum[] = [
  {
    museum_id: 'museum_1',
    slug: 'mnaz',
    name: 'Museu Nacional do Azulejo',
    description:
      'Situado no antigo Convento da Madre de Deus, o Museu Nacional do Azulejo apresenta a historia do azulejo em Portugal, do seculo XV a contemporaneidade, incluindo o celebre painel panoramico de Lisboa pre-terremoto de 1755.',
    address: 'Rua da Madre de Deus, 4, 1900-312 Lisboa, Portugal',
    inaguration_year: 1980,
    coordinates: {
      lat: 38.7244,
      lon: -9.11389,
    },
  },
  {
    museum_id: 'museum_22',
    slug: 'mnt',
    name: 'Museu Nacional do Traje',
    description:
      'Localizado no Palacio Angeja-Palmela, o Museu Nacional do Traje possui colecoes de vestuario masculino e feminino desde o seculo XVIII ate ao presente, incluindo acessorios de moda e estudos de conservacao textil.',
    address: 'Largo Julio Castilho, Lumiar, 1600-483 Lisboa, Portugal',
    inaguration_year: 1977,
    coordinates: {
      lat: 38.775163,
      lon: -9.164985,
    },
  },
  {
    museum_id: 'museum_30',
    slug: 'mj',
    name: 'Mosteiro dos Jeronimos',
    description:
      'Monumento emblematico de Belem e expoente maior do estilo manuelino, o Mosteiro dos Jeronimos integra espacos de grande valor historico, artistico e simbolico ligados a expansao maritima portuguesa.',
    address: 'Praca do Imperio, 1400-206 Lisboa, Portugal',
    inaguration_year: 1907,
    coordinates: {
      lat: 38.6979,
      lon: -9.2061,
    },
  },
]
