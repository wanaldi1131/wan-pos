import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const { name, staff_code, email, pin } = await req.json()

  if (!name || !staff_code || !email || !pin || pin.length !== 6) {
    return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: pin,
    email_confirm: true,
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: authData.user.id,
      full_name: name,
      role: 'kasir',
      active: true,
      email_login: email,
      staff_code,
    })

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json({ id: authData.user.id, email })
}
