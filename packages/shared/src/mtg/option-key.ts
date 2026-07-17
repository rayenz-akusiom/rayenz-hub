export type OptionKeyCard = {
  name: string;
  set_code?: string;
  collector_number?: string;
};

export function optionKey(opt: OptionKeyCard): string {
  return [opt.name, opt.set_code || '', opt.collector_number || ''].join('|');
}
