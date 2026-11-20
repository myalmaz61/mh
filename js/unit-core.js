// Pure, offline unit conversions. UK (imperial) gallons and miles explicitly named.
export const UNIT_GROUPS = Object.freeze({
  length: {bg:'Дължина',en:'Length',units:[
    ['mm','Милиметри','Millimetres',0.001],['cm','Сантиметри','Centimetres',0.01],['m','Метри','Metres',1],['km','Километри','Kilometres',1000],
    ['in','Инчове','Inches',0.0254],['ft','Футове','Feet',0.3048],['yd','Ярдове','Yards',0.9144],['mi','Мили','Miles',1609.344]]},
  mass: {bg:'Тегло',en:'Mass',units:[
    ['mg','Милиграми','Milligrams',0.001],['g','Грамове','Grams',1],['kg','Килограми','Kilograms',1000],['t','Тонове','Metric tonnes',1000000],
    ['oz','Унции','Ounces',28.349523125],['lb','Паундове','Pounds',453.59237],['st','Стоун','Stone',6350.29318]]},
  volume: {bg:'Обем',en:'Volume',units:[
    ['ml','Милилитри','Millilitres',0.001],['l','Литри','Litres',1],['m3','Кубични метри','Cubic metres',1000],
    ['floz-uk','Течни унции (UK)','Fluid ounces (UK)',0.0284130625],['pt-uk','Пинти (UK)','Pints (UK)',0.56826125],
    ['gal-uk','Галони (UK)','Gallons (UK)',4.54609],['cup-us','Чаши (US)','Cups (US)',0.2365882365]]},
  area: {bg:'Площ',en:'Area',units:[
    ['cm2','Квадратни сантиметри','Square centimetres',0.0001],['m2','Квадратни метри','Square metres',1],
    ['km2','Квадратни километри','Square kilometres',1000000],['ft2','Квадратни футове','Square feet',0.09290304],
    ['acre','Акри','Acres',4046.8564224],['ha','Хектари','Hectares',10000]]},
  speed: {bg:'Скорост',en:'Speed',units:[
    ['mps','м/сек','m/s',1],['kph','км/ч','km/h',1/3.6],['mph','мили/ч','mph',0.44704],['knot','Възли','Knots',0.5144444444444445]]},
  temperature: {bg:'Температура',en:'Temperature',units:[
    ['c','Целзий','Celsius',1],['f','Фаренхайт','Fahrenheit',1],['k','Келвин','Kelvin',1]]},
  data: {bg:'Размер на данни',en:'Data size',units:[
    ['B','Байтове','Bytes',1],['KB','Килобайтове (1000)','Kilobytes (1000)',1000],['MB','Мегабайтове (1000)','Megabytes (1000)',1e6],
    ['GB','Гигабайтове (1000)','Gigabytes (1000)',1e9],['KiB','Кибибайтове (1024)','Kibibytes (1024)',1024],
    ['MiB','Мебибайтове (1024)','Mebibytes (1024)',1048576],['GiB','Гибибайтове (1024)','Gibibytes (1024)',1073741824]]},
});
export function parseQuantity(raw){
  const value=String(raw??'').trim().replace(/\s/g,'').replace(',','.');
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))throw Error('Invalid number');
  const num=Number(value);
  if(!Number.isFinite(num)||Math.abs(num)>1e12)throw Error('Out of range');
  return num;
}
export function convertUnits(category,from,to,value){
  const group=UNIT_GROUPS[category];if(!group)throw Error('Invalid category');
  const u1=group.units.find(x=>x[0]===from),u2=group.units.find(x=>x[0]===to);
  if(!u1||!u2||typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1e12)throw Error('Invalid input');
  let result;
  if(category==='temperature'){
    const c=from==='c'?value:from==='f'?(value-32)*5/9:value-273.15;
    if(c < -273.15000001)throw Error('Below absolute zero');
    result=to==='c'?c:to==='f'?c*9/5+32:c+273.15;
  }else result=value*u1[3]/u2[3];
  if(!Number.isFinite(result))throw Error('Result out of range');
  return Math.abs(result)<1e-12?0:result;
}
export function readableNumber(value,language='bg'){
  if(!Number.isFinite(value))throw Error('Invalid result');
  return new Intl.NumberFormat(language==='en'?'en-GB':'bg-BG',{maximumSignificantDigits:11,useGrouping:false}).format(value);
}
