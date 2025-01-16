interface KnowledgeNode {
  id: string;
  concept: string;
  relationships: string;
  confidence: number;
  lastUpdated: string;
}

export class KnowledgeGraph {
  private nodes: Map<string, KnowledgeNode>;

  constructor() {
    this.nodes = new Map();
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  async addNode(concept: string, relationships: Record<string, string>): Promise<string> {
    const id = this.generateId();
    
    const node: KnowledgeNode = {
      id,
      concept,
      relationships: JSON.stringify(relationships),
      confidence: 1.0,
      lastUpdated: new Date().toISOString()
    };

    this.nodes.set(id, node);
    return id;
  }

  async updateNode(id: string, updates: Partial<KnowledgeNode>): Promise<void> {
    const node = this.nodes.get(id);
    if (!node) return;

    const updatedNode = {
      ...node,
      ...updates,
      lastUpdated: new Date().toISOString()
    };

    this.nodes.set(id, updatedNode);
  }

  async queryKnowledge(domain: string): Promise<KnowledgeNode[]> {
    return Array.from(this.nodes.values())
      .filter(node => {
        const relationships = JSON.parse(node.relationships);
        return relationships.domain === domain;
      })
      .sort((a, b) => b.confidence - a.confidence);
  }

  async findRelatedConcepts(concept: string): Promise<KnowledgeNode[]> {
    return Array.from(this.nodes.values())
      .filter(node => node.relationships.includes(concept))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10);
  }

  async updateConfidence(id: string, success: boolean): Promise<void> {
    const node = this.nodes.get(id);
    if (!node) return;

    const newConfidence = success
      ? Math.min(node.confidence + 0.1, 1.0)
      : Math.max(node.confidence - 0.1, 0.0);

    await this.updateNode(id, { confidence: newConfidence });
  }

  async pruneNodes(threshold: number = 0.2): Promise<number> {
    const sizeBefore = this.nodes.size;

    for (const [id, node] of this.nodes.entries()) {
      if (node.confidence < threshold) {
        this.nodes.delete(id);
      }
    }

    return sizeBefore - this.nodes.size;
  }

  async consolidateKnowledge(): Promise<void> {
    const lowConfidenceNodes = Array.from(this.nodes.values())
      .filter(node => node.confidence < 0.5)
      .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());

    for (const node of lowConfidenceNodes) {
      const relatedNodes = await this.findRelatedConcepts(node.concept);
      if (relatedNodes.some(n => n.confidence > 0.8)) {
        await this.pruneNodes(0.5);
      }
    }
  }
}