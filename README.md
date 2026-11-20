# MADAGASCAR EARN

Sehatra mampifandray ny mpanjifa sy ny mpiasa eto Madagasikara.

## Rafitra ampiasaina

- Pejy fandraisana amin'ny teny Malagasy sy Frantsay.
- Fisoratana anarana ho Mpiasa na Mpanjifa.
- Fidirana amin'ny kaonty amin'ny email na laharana finday.
- Fiarovana tenimiafina amin'ny PBKDF2-SHA256.
- Session 7 andro: token kisendrasendra ao anaty cookie HttpOnly; hash ihany no tehirizina ao amin'ny D1.
- Fanamarinana ny session sy fivoahana amin'ny kaonty.
- Pejy administrateur sy antontan'isa voaaro.
- PWA: manifest, kisary, sary ary cache fototra ho an'ny fampiasana rehefa tsy misy Internet.

## API efa misy

| Lalana | Fomba | Asa |
|---|---|---|
| `/api/auth/register` | POST | Mamorona kaonty sy portefeuille |
| `/api/auth/login` | POST | Miditra amin'ny kaonty |
| `/api/auth/me` | GET | Manamarina ny session ankehitriny |
| `/api/auth/logout` | POST | Manafoana ny session |
| `/api/admin/stats` | GET | Maka antontan'isa ho an'ny administrateur |
| `/api/health` | GET | Manamarina ny fifandraisana amin'ny D1 |

## Fametrahana amin'ny Android

Rehefa vita ny déploiement amin'ny HTTPS:
1. Sokafy amin'ny Chrome Android ny adiresin'ny sehatra.
2. Sokafy ny menio Chrome.
3. Safidio **Installer l'application** na **Ajouter à l'écran d'accueil**, raha miseho.
4. Sokafy amin'ny kisary MADAGASCAR EARN.

Ity dia PWA azo apetraka amin'ny Android; mbola tsy rakitra APK natively compilé izy amin'izao. Mila dingana fanampiny sy fanamarinana manokana vao azo avoaka ho APK.

## Fepetra ilaina amin'ny Cloudflare

- Cloudflare Pages Functions no mampandeha ny API.
- Tsy maintsy misy D1 binding antsoina hoe `DB`.
- Ilaina ny tabilao ampiasain'ny API: `users`, `wallets`, `sessions`, `audit_logs`, ary ireo tabilao ampiasain'ny antontan'isa.
- Aza apetraka ao amin'ny kaody ny tenimiafina na secret.

## Asa mbola tsy vita

Ity repository ity dia mbola fototra fampandrosoana. Mbola mila amboarina sy andrana ny dashboard feno ho an'ny Mpiasa sy Mpanjifa, famoahana sy fitantanana missions, submissions, fanamarinana asa, portefeuille sy fisintonana Airtel Money/MVola, referral, ary fitantanana feno ho an'ny administrateur. Tsy tokony hampiasaina amin'ny fandoavam-bola tena izy raha tsy vita ireo fitsapana sy fiarovana ireo.

## Fanamarinana

Ny fanovana dia atao amin'ny branche `main`. Hamarino ao amin'ny Cloudflare Pages fa io no branche ampiasaina amin'ny production, ary jereo ny déploiement farany alohan'ny hizahana ny tranonkala.
