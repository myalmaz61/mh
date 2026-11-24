export const MAX_BOOKMARKS=500;
export const emptyBookmarks=()=>({schema:1,items:[]});
const isDate=v=>typeof v==='string'&&v.length<=40&&!Number.isNaN(Date.parse(v));
export function normaliseLink(value){
  if(typeof value!=='string'||value.length>2048)throw Error('Invalid link');
  const url=new URL(value.trim());
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!url.hostname||url.href.length>2048)throw Error('Invalid link');
  return url.href;
}
export function validBookmarks(data){
  if(!data||typeof data!=='object'||Array.isArray(data)||data.schema!==1||!Array.isArray(data.items)||data.items.length>MAX_BOOKMARKS)return false;
  const ids=new Set(),urls=new Set();
  for(const item of data.items){
    if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.id!=='string'||item.id.length<1||item.id.length>100||ids.has(item.id)||
      typeof item.title!=='string'||!item.title.trim()||item.title.length>160||typeof item.category!=='string'||item.category.length>60||
      typeof item.favourite!=='boolean'||!isDate(item.createdAt)||!isDate(item.updatedAt))return false;
    let url;
    try{url=normaliseLink(item.url);}catch{return false;}
    if(url!==item.url||urls.has(url))return false;
    ids.add(item.id);urls.add(url);
  }
  return true;
}

/** Case-insensitive category grouping for filtering. Never mutates saved categories. */
export function bookmarkCategories(items){
  if(!Array.isArray(items))throw Error('Invalid bookmarks');
  const counts=new Map();let uncategorized=0;
  for(const item of items){
    const raw=typeof item?.category==='string'?item.category.trim():'';
    if(!raw){uncategorized++;continue;}
    const key=raw.toLocaleLowerCase();
    const prior=counts.get(key);
    if(prior)prior.count++;
    else counts.set(key,{key,name:raw,count:1});
  }
  return {named:[...counts.values()].sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'})),uncategorized};
}
export function filterBookmarks(items,{category='all',favourites=false,query=''}={}){
  if(!Array.isArray(items))throw Error('Invalid bookmarks');
  const needle=String(query).toLocaleLowerCase().trim();
  return items.filter(item=>{
    if(favourites&&!item.favourite)return false;
    const raw=item.category.trim().toLocaleLowerCase();
    if(category==='uncategorized'&&raw)return false;
    if(category!=='all'&&category!=='uncategorized'&&category!==`category:${raw}`)return false;
    return `${item.title} ${item.url} ${item.category}`.toLocaleLowerCase().includes(needle);
  }).sort((a,b)=>Number(b.favourite)-Number(a.favourite)||b.updatedAt.localeCompare(a.updatedAt));
}
