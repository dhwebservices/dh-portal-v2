import { useParams } from 'react-router-dom'
import Placeholder from './Placeholder'
import { findClient } from '../exampleData'

// One client's page. Built in phase 2. Until then it shows the client's name.
export default function ClientPage() {
  const { id } = useParams()
  const client = findClient(id)
  return <Placeholder title={client ? client.name : 'Client'} sub="Clients" note="The client page is built in phase 2." />
}
