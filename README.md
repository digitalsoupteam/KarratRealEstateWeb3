# KARRAT

## Docs

### [Multisig.sol](/contracts/access/MultisigWallet.sol)

frontend description:

```typescript
const multisig: Multisig
// Что бы проверить что подключенный кошелек имеет доступ надо проверить
if(multisig.signers(cuurentUser) == false) throw 'Unathorized!'
// один из владельцев иницирует транзакцию
// _target - любой адрес, в ui добавить возможность выбирать из списка смарт контрактов
// _value - если понадобиться отправить Matic (обычно 0)
// _data - encodedFunctionData, которая будет вызвана по адресу _target
multisig.connect(owner1).submitTransaction(address _target, uint256 _value, bytes _data)
// У всех остальных отрисовывается список ожидающих транзакций
// Список транзакций получать приемлимой пагинацией, от наибольшоего txId к 1(первому)
const latestTxId = multisig.txsCount()
any_external_multicall.agregate([
    for(const txId of [latestTxId ... 1])
        multisig.getTransaction(txId, currentOwner.address)
])
// В результате получи объекты транзакций
tx.executed // Выполнена ли уже транзакций
tx.confirmationsCount // текущее количество подписей
tx.alreadySigned // подписал ли транзакцию currentOwner
// Так же понадобяться данные
multisig.requiredSigners // сколько подписей требуется для исполнения транзакции
// После чего остальные владельцы принимают транзакцию
multisigю.connect(owner2).acceptTransaction(txId)
// Так же владелец может отозвать свою подпись, если транзакция еще не исполнена 
multisig.connect(owner2).revokeTransaction(txId) 
```