from pathlib import Path

path = Path("scripts/add_vin_vehicle.py")
text = path.read_text(encoding="utf-8")
old = """    '  const orderResult = await getAllCustomerOrders(env, customer.id);\\n  const assets = await getCustomerAssets(env, customer.id);\\n  const cars = mergeCustomerAssets(assets, orderResult.orders);',"""
new = """    '  const orderResult = await getAllCustomerOrders(env, customer.id);\\n  let assets = [];\\n  try {\\n    assets = await getCustomerAssets(env, customer.id);\\n  } catch (error) {\\n    console.error(JSON.stringify({ event: \"customer_assets_load\", success: false, message: error instanceof Error ? error.message : String(error) }));\\n  }\\n  const cars = mergeCustomerAssets(assets, orderResult.orders);',"""
if text.count(old) != 1:
    raise SystemExit(f"expected one assets replacement string, found {text.count(old)}")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
