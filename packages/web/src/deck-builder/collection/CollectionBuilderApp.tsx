import { BuilderApp } from '../shared/BuilderApp';
import { CreateCollectionDialog } from './CreateCollectionDialog';

export function CollectionBuilderApp() {
  return (
    <BuilderApp
      builderFormat="collection"
      title="Collection Builder"
      addLabel="Add collection"
      CreateDialog={CreateCollectionDialog}
    />
  );
}
