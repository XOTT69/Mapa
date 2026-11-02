// User-supplied public channels are supplementary, never official alert authorities.
const requested=['chyste_nebo','kyivschinanews','kiev_radar_truvoga_Vyshneve','kryuvysh','kyiv_airdef','eRadarrua','tviy_kyivv','times_ukraina','waypoint_ua','KyivPolitic','monitorwarr','kievinform_ua1','kiev_news24','chyste_neboo','kyiv_m0nitoring','kievkyiv','mon1tor_ua'];
export const CHANNEL_SOURCES=Object.freeze([
 {id:'kyivoda',title:'Київська ОВА',official:true,verificationUrl:'https://cpd.gov.ua/announcement/spysok-bezpechnyh-kanaliv-otrymannya-informacziyi/'},
 {id:'kyivcityofficial',title:'КМДА',official:true,verificationUrl:'https://kyivavtodor.kyivcity.gov.ua/news/iak-otrymaty-ofitsiinu-informatsiiu-vid-kmda'},
 ...requested.map(id=>({id:id.toLowerCase(),title:'@'+id,official:false,verificationUrl:null}))
]);
