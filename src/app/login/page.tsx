"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [mode, setMode] = useState<"login"|"signup">("login");
  const [message, setMessage] = useState("");
  async function submit(formData: FormData) {
    const client = createClient();
    if (!client) { setMessage("Добавьте настройки Supabase в .env.local"); return; }
    const credentials = { email: String(formData.get("email")), password: String(formData.get("password")) };
    const { error } = mode === "login" ? await client.auth.signInWithPassword(credentials) : await client.auth.signUp(credentials);
    if (error) setMessage(error.message); else if (mode === "login") window.location.href = "/"; else setMessage("Проверьте почту для подтверждения");
  }
  return <div className="content" style={{display:"grid",placeItems:"center",minHeight:"calc(100vh - 74px)"}}><div className="card panel" style={{width:"min(420px,100%)"}}><div className="brand" style={{padding:"0 0 24px"}}><span className="brandmark">VK</span><span>Ads Control</span></div><h1>{mode==="login"?"Вход":"Регистрация"}</h1><p className="muted">Доступ к рекламным проектам</p><form action={submit} style={{display:"grid",gap:15,marginTop:22}}><label>Email<input name="email" type="email" required/></label><label>Пароль<input name="password" type="password" minLength={8} required/></label>{message&&<div className="notice">{message}</div>}<button className="btn primary">{mode==="login"?"Войти":"Создать аккаунт"}</button></form><button className="btn" style={{width:"100%",marginTop:10}} onClick={()=>setMode(mode==="login"?"signup":"login")}>{mode==="login"?"Нет аккаунта? Регистрация":"Уже есть аккаунт? Войти"}</button></div></div>;
}
