"use client";

import { cmsCatalog, coupons } from "@pulso/data";
import { useStoreData } from "@/components/store-data";
import { Input } from "@/components/ui/input";
import { usePulso } from "@/lib/store";

export function AdminPanels() {
  const { allProducts } = useStoreData();
  const savePatch = usePulso((state) => state.savePatch);
  const saveCouponPatch = usePulso((state) => state.saveCouponPatch);
  const saveContentPatch = usePulso((state) => state.saveContentPatch);
  const couponPatches = usePulso((state) => state.couponPatches);
  const contentPatches = usePulso((state) => state.contentPatches);
  const orders = usePulso((state) => state.users.flatMap((user) => user.orders));
  const guestOrders = usePulso((state) => state.guestOrders);
  const analytics = usePulso((state) => state.analytics);
  const allOrders = [...orders, ...guestOrders];

  return (
    <div className="mt-10 space-y-10">
      <section>
        <h2 className="font-display text-4xl">Estoque e drop</h2>
        <div className="mt-3 space-y-4">
          {allProducts.filter((product) => product.flavors.length > 0).slice(0, 6).map((product) => (
            <div key={product.slug} className="rounded-2xl border border-white/10 p-3">
              <p className="font-display text-2xl">{product.name}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {product.flavors.map((flavor) => (
                  <label key={flavor.id} className="text-xs text-muted-foreground">
                    {flavor.name}
                    <Input
                      className="mt-1"
                      inputMode="numeric"
                      aria-label={`Estoque ${product.name} ${flavor.name}`}
                      defaultValue={String(flavor.stock)}
                      onBlur={(event) => {
                        const stock = Number(event.target.value);
                        if (Number.isInteger(stock) && stock >= 0) savePatch(product.slug, { stockByFlavor: { [flavor.id]: stock } });
                      }}
                    />
                  </label>
                ))}
              </div>
              {product.drop ? (
                <label className="mt-2 block text-xs text-muted-foreground">
                  Fim do drop
                  <Input
                    className="mt-1"
                    aria-label={`Fim do drop ${product.name}`}
                    defaultValue={product.drop.endsAt}
                    onBlur={(event) => savePatch(product.slug, { dropEndsAt: event.target.value })}
                  />
                </label>
              ) : null}
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2 className="font-display text-4xl">Pedidos neste navegador</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {allOrders.length === 0 ? <li>Nenhum pedido ainda.</li> : null}
          {allOrders.map((order) => (
            <li key={order.id} className="flex justify-between gap-3 border-t border-white/10 py-2">
              <span>{order.code}</span>
              <span className="text-muted-foreground">{order.status} · {order.payment.gateway ?? order.payment.method}</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-display text-4xl">Cupons</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {coupons.map((coupon) => {
            const active = couponPatches[coupon.code]?.active ?? coupon.active;
            return (
              <li key={coupon.code} className="flex items-center justify-between gap-3 border-t border-white/10 py-2">
                <span>{coupon.code}</span>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={active} aria-label={`Cupom ${coupon.code} ativo`} onChange={(event) => saveCouponPatch(coupon.code, event.target.checked)} className="accent-lime" />
                  ativo
                </label>
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <h2 className="font-display text-4xl">Conteúdo</h2>
        <ul className="mt-3 space-y-3">
          {cmsCatalog().map((entry) => (
            <li key={entry.id} className="rounded-2xl border border-white/10 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-pink">{entry.kind}</p>
              <Input
                className="mt-2"
                aria-label={`Título ${entry.title}`}
                defaultValue={contentPatches[entry.id]?.title ?? entry.title}
                onBlur={(event) => saveContentPatch(entry.id, { title: event.target.value })}
              />
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  defaultChecked={!(contentPatches[entry.id]?.hidden ?? entry.hidden)}
                  aria-label={`Publicado ${entry.title}`}
                  onChange={(event) => saveContentPatch(entry.id, { hidden: !event.target.checked })}
                  className="accent-lime"
                />
                publicado
              </label>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-display text-4xl">Analytics local</h2>
        <p className="text-sm text-muted-foreground">{analytics.length} eventos depois do aceite de privacidade. Nada sai deste navegador.</p>
        <ul className="mt-2 text-sm text-muted-foreground">
          {analytics.slice(-8).map((event, index) => <li key={`${event.name}-${event.path}-${index}`}>{event.name} {event.path}</li>)}
        </ul>
      </section>
    </div>
  );
}
