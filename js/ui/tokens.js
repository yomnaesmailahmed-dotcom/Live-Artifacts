// Inline style fragments shared by the view models. Values are the prototype's design tokens, unchanged.

export const DOT = {
  claude: 'background: #5A63A8;',
  you: 'background: #C2A25A;',
  both: 'background: linear-gradient(90deg, #C2A25A 50%, #5A63A8 50%);',
};

export const TOGGLE_ON = 'background: #2A3042; color: #F1EFEA; border: 1px solid #2A3042;';
export const TOGGLE_OFF = 'background: #FFFFFF; color: #2A3042; border: 1px solid #2A3042;';
export const FILTER_OFF = 'background: #FFFFFF; color: #2A3042; border: 1px solid #DCD8D0;';

export const CELL_CHANGED = 'background: #F3E1D6;';
export const CELL_NEEDED = 'background: #F5ECD3;';
export const TEXT_OVERDUE = 'color: #B05A5A; font-weight: 600;';

export const CHIP_DONE = 'background: #2A3042; color: #F1EFEA; border-color: #2A3042;';
export const CHIP_OPEN = 'background: #F5ECD3; border-color: #9A7F3A; color: #6B5622;';
export const CHIP_EMPTY = 'border-style: dashed; color: #646A78;';

export const OPTION_SELECTED = 'border: 2px solid #2A3042; background: #FFFFFF;';
export const OPTION_IDLE = 'border: 1px solid #DCD8D0; background: #F7F5F0;';

export const NUM_CURRENT = 'background: #2A3042; color: #FFFFFF; border: 1px solid #2A3042;';
export const NUM_PAST = 'background: #FFFFFF; color: #2A3042; border: 1px solid #2A3042;';
export const NUM_FUTURE = 'background: transparent; color: #8D92A0; border: 1px solid #CBCED8;';

// Project status chips (colour only for functional status, per the PMO look).
export const STATUS_CHIP = {
  'On Track': 'background: #FFFFFF; border-color: #2A3042; color: #2A3042;',
  'At Risk': 'background: #F5ECD3; border-color: #9A7F3A; color: #6B5622;',
  'Delayed': 'background: #F6E7E4; border-color: #B05A5A; color: #944747;',
  'On Hold': 'background: #F2F2F2; border-color: #8D92A0; color: #3F4554;',
  'Completed': 'background: #2A3042; border-color: #2A3042; color: #F1EFEA;',
  'Not Started': 'border-style: dashed; color: #646A78;',
  'Not Awarded': 'background: #F2F2F2; border-style: dashed; color: #646A78;',
};

export const SYNC_DOT = {
  live: 'background: #2A3042;',
  saving: 'background: #5A63A8;',
  idle: 'background: #8D92A0;',
  error: 'background: #B05A5A;',
};
