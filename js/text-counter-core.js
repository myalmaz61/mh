/** Unicode-aware counts. This tool never persists text. */
export const MAX_TEXT_LENGTH=100_000;

export function countText(input,locale='bg') {
  if(typeof input!=='string'||input.length>MAX_TEXT_LENGTH)throw Error('Text too long');
  if(locale!=='bg'&&locale!=='en')locale='bg';
  const text=input.replace(/\r\n?/g,'\n');
  const useSegmenter=typeof Intl.Segmenter==='function';
  const chars=useSegmenter?[...new Intl.Segmenter(locale,{granularity:'grapheme'}).segment(text)].map(x=>x.segment):Array.from(text);
  const characters=chars.length;
  const withoutSpaces=chars.filter(x=>!/^\s+$/u.test(x)).length;
  let words;
  if(useSegmenter){
    words=0;
    for(const token of new Intl.Segmenter(locale,{granularity:'word'}).segment(text))if(token.isWordLike)words++;
  }else{
    words=(text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)||[]).length;
  }
  const lines=text.length?text.split('\n').length:0;
  const paragraphs=text.trim()?text.trim().split(/\n[\t ]*\n+/u).filter(p=>p.trim()).length:0;
  const bytes=new TextEncoder().encode(text).length;
  return {words,characters,withoutSpaces,lines,paragraphs,bytes,minutes:Math.ceil(words/200)};
}
