# Fametrahana ny fanamarinana antontan-taratasy — Preview ihany

Ireo kaody vaovao dia ao amin'ny sampana `test-auth-fix`. **Aza ampiharina amin'ny Production aloha.**

## 1. D1 Preview

Ao amin'ny Cloudflare Dashboard, sokafy ny D1 database `madagascar-earn-v2-preview`, avy eo ny Console. Alefaso indray mandeha ny votoatin'ny:

`migrations/0002_qualifications.sql`

Mamorona ny tabilao `worker_qualifications` izy io ary manampy ny saha `missions.required_qualification`. Aza alefa amin'ny database Production.

## 2. R2 Preview

Mamoròna R2 bucket manokana ho an'ny antontan-taratasy (ohatra: `madagascar-earn-qualifications-preview`). Aza asiana public access na custom domain.

Ao amin'ny Pages project `madagascar-earn-v2-pages`, ampio R2 binding amin'ny environment **Preview**:
- Variable name: `QUALIFICATION_FILES`
- Bucket: ilay bucket Preview vao noforonina

Aza ampifandraisina amin'ny Production aloha.

## 3. Rehefa vita ireo

Andraso ny Preview deployment avy amin'ny sampana `test-auth-fix`, ary andramo:
- fisoratana anarana vaovao: tokony ho active avy hatrany;
- fandefasana CV/diplaoma: PDF/JPG/PNG, 5 Mo fara-fahabetsany;
- pejy Admin: fanokafana rakitra sy fankatoavana/fandavana;
- iraka tsy mila taratasy: hita amin'ny mpiasa;
- iraka mitaky diplaoma/mari-pahaizana/portfolio: tsy hita sy tsy azo alefa raha tsy misy porofo nekena.

## Fiarovana

Tsy tehirizina ao amin'ny D1 ny votoatin'ny rakitra; R2 tsy public no itahirizana azy. Ny Administrateur active ihany no afaka mijery ny antontan-taratasy sy manapa-kevitra. Ny fanamarinana antontan-taratasy dia misaraka amin'ny fidirana amin'ny kaonty.

**Sata amin'izao:** voaomana ao amin'ny Git ny kaody sy ny migration. Tsy mbola voamarina fa nampiharina ny migration D1, napetraka ny R2 binding, na nandalo fitsapana ny Preview.