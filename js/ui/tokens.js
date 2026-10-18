// Inline style fragments shared by the view models. Values are the prototype's design tokens, unchanged.

export const DOT = {
  claude: 'background: #2F5BFF;',
  you: 'background: #C9A227;',
  both: 'background: linear-gradient(90deg, #C9A227 50%, #2F5BFF 50%);',
};

export const TOGGLE_ON = 'background: #16191D; color: #F6F5F1; border: 1px solid #16191D;';
export const TOGGLE_OFF = 'background: #FFFFFF; color: #16191D; border: 1px solid #16191D;';
export const FILTER_OFF = 'background: #FFFFFF; color: #16191D; border: 1px solid #D9D6CE;';

export const CELL_CHANGED = 'background: #FCE4D6;';
export const CELL_NEEDED = 'background: #FFF2CC;';
export const TEXT_OVERDUE = 'color: #C00000; font-weight: 600;';

export const CHIP_DONE = 'background: #16191D; color: #F6F5F1; border-color: #16191D;';
export const CHIP_OPEN = 'background: #FFF2CC; border-color: #8A6A00; color: #5C4300;';
export const CHIP_EMPTY = 'border-style: dashed; color: #5B6068;';

export const OPTION_SELECTED = 'border: 2px solid #16191D; background: #FFFFFF;';
export const OPTION_IDLE = 'border: 1px solid #D9D6CE; background: #FBFAF7;';

export const NUM_CURRENT = 'background: #16191D; color: #FFFFFF; border: 1px solid #16191D;';
export const NUM_PAST = 'background: #FFFFFF; color: #16191D; border: 1px solid #16191D;';
export const NUM_FUTURE = 'background: transparent; color: #8A8F96; border: 1px solid #C9CDD6;';

export const SYNC_DOT = {
  live: 'background: #16191D;',
  saving: 'background: #2F5BFF;',
  idle: 'background: #8A8F96;',
  error: 'background: #C00000;',
};
