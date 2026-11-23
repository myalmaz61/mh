/** v4.0.0: explicit, non-destructive everyday favourites shortcut.
 * Personal records are never changed and existing favourite order is kept.
 */
export const EVERYDAY_TOOL_IDS = Object.freeze(['notes','weather']);

export function addEverydayFavourites(favourites,hiddenTools){
  if(!Array.isArray(favourites)||!Array.isArray(hiddenTools)||
      !favourites.every(id=>typeof id==='string')||!hiddenTools.every(id=>typeof id==='string')){
    throw Error('Invalid tool preferences');
  }
  const added=[...new Set([...favourites,...EVERYDAY_TOOL_IDS])];
  const visible=hiddenTools.filter(id=>!EVERYDAY_TOOL_IDS.includes(id));
  return {
    favourites:added,
    hiddenTools:visible,
    changed:added.length!==favourites.length||visible.length!==hiddenTools.length
  };
}
