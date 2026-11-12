export const ua = {
  'app.title': 'Гусь тебе побрав',
  'hud.newOffice': 'Новий офіс',
  'hud.seed': 'Сід',
  'hud.controls': 'WASD або стрілки — рух · коліщатко — наближення',
  'room.lobby': 'Головне Лобі',
  'room.buying': 'Байєр-Зона',
  'room.copycat': 'Цех Клонування Креосів',
  'room.news': 'Конвеєр Новостніків',
  'room.cargo': 'Склад Мерчу та Реквізиту',
  'room.motion': 'Моушн-Дизайн і Рендер-Ферма',
  'room.meeting': 'Мітинг-Рум «Правки о 18:59»',
  'room.lounge': 'Кавопоінт',
  'room.greenhouse': 'Оранжерея',
  'room.corridor': 'Коридор',
  'decor.brand': 'GOLDEN EGG',
  'decor.brandSub': 'Traffic & Motion',
  'decor.sticker': 'ПОГРАЙСЯ ЗІ ШРИФТАМИ',
  'decor.urgent': 'ТЕРМІНОВИЙ СОЗВОН',
  'decor.kanban': 'In Review → Done',
} as const;

export type I18nKey = keyof typeof ua;
