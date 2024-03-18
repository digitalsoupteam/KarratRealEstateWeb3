# KARRAT

## Docs

### [Multisig.sol](/contracts/access/MultisigWallet.sol)

frontend description:

Сначала проверить что подключенный кошелек имеет доступ надо проверить
```typescript
const multisig: Multisig
if(multisig.signers(cuurentUser) == false) throw 'Unathorized!'
```

Один из владельцев иницирует транзакцию
```typescript
// _target - любой адрес, в ui добавить возможность выбирать из списка смарт контрактов
// _value - если понадобиться отправить Matic (обычно 0)
// _data - encodedFunctionData, которая будет вызвана по адресу _target
multisig.connect(owner1).submitTransaction(address _target, uint256 _value, bytes _data)
```

У всех остальных отрисовывается список ожидающих транзакций
Список транзакций получать приемлимой пагинацией, от наибольшоего txId к 1(первому)
```typescript
const latestTxId = multisig.txsCount()
any_external_multicall.agregate([
    for(const txId of [latestTxId ... 1])
        multisig.getTransaction(txId, currentOwner.address)
])
```

В результате получим объекты транзакций
```typescript
tx.executed // Выполнена ли уже транзакция
tx.confirmationsCount // текущее количество подписей
tx.alreadySigned // подписал ли транзакцию currentOwner
// Так же понадобяться данные
multisig.requiredSigners // сколько подписей требуется для исполнения транзакции
```

После чего остальные владельцы принимают транзакцию
```typescript
multisig.connect(ownerN).acceptTransaction(txId)
```

Так же владелец может отозвать свою подпись, если транзакция еще не исполнена 
```typescript
multisig.connect(ownerN).revokeTransaction(txId) 
```

Итого как только tx.confirmationsCount станет равен requiredSigners - транзакция будет исполнена