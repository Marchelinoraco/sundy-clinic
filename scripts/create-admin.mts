import "dotenv/config";
import { auth } from "../src/lib/auth";
import { prisma } from "../src/lib/db";
import { slugify } from "../src/lib/slug";

const [email, password, name] = process.argv.slice(2);

if (!email || !password || !name) {
  console.error('Pakai: npm run create-admin -- <email> <kata-sandi> "<nama lengkap>"');
  process.exit(1);
}

const created = await auth.api.signUpEmail({ body: { email, password, name } });

const slug = slugify(name);

const staff = await prisma.staff.create({
  data: { slug, name, role: "SUPER_ADMIN", showOnWebsite: false },
});

await prisma.user.update({ where: { id: created.user.id }, data: { staffId: staff.id } });

console.log(`Akun Super Admin dibuat untuk ${email}.`);
await prisma.$disconnect();
