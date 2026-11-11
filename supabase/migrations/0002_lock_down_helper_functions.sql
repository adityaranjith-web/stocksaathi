-- Trigger functions are never called through the API. Helper functions are only for signed-in users.
revoke execute on function public.on_sale() from public, anon, authenticated;
revoke execute on function public.on_delivery() from public, anon, authenticated;
revoke execute on function public.my_shop() from public, anon;
revoke execute on function public.i_am_owner() from public, anon;
revoke execute on function public.my_item(uuid) from public, anon;
grant execute on function public.my_shop() to authenticated;
grant execute on function public.i_am_owner() to authenticated;
grant execute on function public.my_item(uuid) to authenticated;
