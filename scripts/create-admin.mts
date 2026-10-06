import "dotenv/config";
import { auth } from "../src/lib/auth";
import { prisma } from "../src/lib/db";
import { slugify } from "../src/lib/slug";
import { parseStaffRole, STAFF_ROLE_LABEL } from "../src/lib/staff-role";

const [email, password, name, roleArg] = process.argv.slice(2);
const role = parseStaffRole(roleArg);

if (!email || !password || !name || !role) {
  console.error(
    'Pakai: npm run create-admin -- <email> <kata-sandi> "<nama lengkap>" [SUPER_ADMIN|DOKTER|RESEPSIONIS|APOTEKER|ADMIN_KEUANGAN]',
  );
  process.exit(1);
}

const created = await auth.api.signUpEmail({ body: { email, password, name } });

const slug = slugify(name);

const staff = await prisma.staff.create({
  data: { slug, name, role, showOnWebsite: false },
});

await prisma.user.update({ where: { id: created.user.id }, data: { staffId: staff.id } });

console.log(`Akun ${STAFF_ROLE_LABEL[role]} dibuat untuk ${email}.`);
await prisma.$disconnect();
