# Manual Carton Product Stock Design

## Goal

For newly created carton-enabled products, preserve the stock quantity entered manually by the user instead of deriving it from the carton count multiplied by pieces per carton.

## Approved behavior

- `stock` is always the manually entered quantity in the product form, including for carton-enabled products.
- The product list continues to display `product.stock`; therefore it shows exactly the saved manual quantity.
- `piecesPerCarton`, `cartonPurchasePrice`, and `cartonSalePrice` remain carton metadata.
- The per-piece wholesale price remains automatic: `cartonPurchasePrice / piecesPerCarton`, rounded to the app's two-decimal currency precision.
- `cartonCount` remains a required creation-form input and is sent as carton-entry metadata, but it does not calculate or overwrite `stock`.
- Selling one carton still deducts `piecesPerCarton` from the manual stock quantity; existing carton invoice behavior is unchanged.
- Existing products are not migrated or modified. Their current stored `stock` value continues to display unchanged.

## Validation

- Manual stock must remain a valid non-negative number.
- Carton-enabled products still require a positive integer carton count and pieces per carton, plus valid non-negative carton purchase and sale prices.
- No calculated stock preview is shown or submitted.

## Acceptance criteria

1. Creating a carton product with carton count `4`, pieces per carton `24`, and manual stock `100` persists `stock: 100`.
2. The same creation persists the calculated wholesale price `0.83` for carton purchase price `20`.
3. The products list displays the persisted quantity (`100` in the example) because it already reads `product.stock`.
4. Carton sales keep using pieces per carton to calculate their stock deduction.
5. Existing products retain their stored stock values without a data migration.
